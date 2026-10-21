require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const cloudinary = require('./config/cloudinary.js');
let supabase = null;
if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL ERROR: Supabase credentials are not set in environment variables.");
} else {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

// ✅ FIX 1: Wrap DNS hack so it ONLY runs locally, NEVER on Vercel.
if (!process.env.VERCEL) {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Consignment = require('./models/Consignment');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// ✅ FIX 2: Point to the correctly renamed hidden Vercel file
const refundRoutes = require('./_refunds');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());


// ─── Auth constants & admin seeding ───────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'sas_fallback_secret_2026';
const SEED_ADMIN_EMAIL = 'sobhyantoine@gmail.com';

const signToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

const publicUser = (u) => ({ _id: u._id, username: u.username, email: u.email, role: u.role });

async function seedAdmin() {
  try {
    const existing = await User.findOne({ email: SEED_ADMIN_EMAIL });
    if (!existing) {
      const hashed = await bcrypt.hash('753951', 10);
      await User.create({
        username: 'انطوان صبحي سليمان',
        email: SEED_ADMIN_EMAIL,
        password: hashed,
        role: 'admin',
      });
      console.log('🌱  Seed admin created');
    } else if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.log('🌱  Seed admin role restored');
    }
  } catch (err) {
    console.error('⚠️  seedAdmin error (non-fatal):', err.message);
  }
}

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅  MongoDB connected');
    await mongoose.connection.db
      .collection('consignments')
      .dropIndex('billId_1_companyName_1')
      .catch(() => { });
    await seedAdmin();
  })
  .catch((err) => {
    console.error('❌  MongoDB error:', err);
  });

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is alive' });
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Verifies the Bearer JWT and exposes a trusted identity on req.user:
//   { _id, id, username, role, email }
// Tokens issued before usernames were embedded fall back to one DB lookup, so the
// uploader identity is ALWAYS derived server-side and never from the request body.
const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ message: 'غير مصرح' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'الجلسة منتهية، يرجى تسجيل الدخول مجدداً' });
  }

  try {
    if (!decoded.username) {
      const dbUser = await User.findById(decoded.id).select('username role email');
      if (!dbUser) return res.status(401).json({ message: 'المستخدم غير موجود' });
      decoded = { ...decoded, username: dbUser.username, role: dbUser.role, email: dbUser.email };
    }
    req.user = { ...decoded, _id: decoded.id };
    next();
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'صلاحيات المدير مطلوبة' });
  next();
};

// ─── Cloudinary Signature Route (auth required) ───────────────────────────────
app.post('/api/cloudinary-sign', requireAuth, (req, res) => {
  const clean = (str) => (str ? String(str).replace(/[|=]/g, '') : 'N/A');
  const { acid, label, companyName, supplierName, certificateNumber, arrivalPort } = req.body || {};

  const paramsToSign = {
    timestamp: Math.round((new Date).getTime() / 1000),
    folder: 'consignments',
  };

  if (acid && label) {
    paramsToSign.public_id = `${clean(acid)}_${clean(label)}_${paramsToSign.timestamp}`;
    paramsToSign.context = `acid=${clean(acid)}|label=${clean(label)}|company=${clean(companyName)}|supplier=${clean(supplierName)}|certificate=${clean(certificateNumber)}|port=${clean(arrivalPort)}|uploader=${clean(req.user.username)}`;
  }

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  res.status(200).json({
    timestamp: paramsToSign.timestamp,
    signature,
    context: paramsToSign.context,
    public_id: paramsToSign.public_id,
  });
});

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!User.isValidArabicFullName(username))
      return res.status(400).json({ message: 'الاسم يجب أن يكون ثلاثي باللغة العربية (مثال: انطوان صبحي سليمان)' });
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string')
      return res.status(400).json({ message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    if (password.length < 6)
      return res.status(400).json({ message: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail }))
      return res.status(400).json({ message: 'البريد الإلكتروني مسجل بالفعل' });

    const hashed = await bcrypt.hash(password, 10);
    // role is ALWAYS 'user' on signup — never taken from the request body
    const user = await User.create({
      username: username.trim().replace(/\s+/g, ' '),
      email: normalizedEmail,
      password: hashed,
      role: 'user',
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'البريد الإلكتروني مسجل بالفعل' });
    if (err.name === 'ValidationError')
      return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(' | ') });
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string')
      return res.status(400).json({ message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    const ok = user && (await bcrypt.compare(password, user.password));
    if (!ok) return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'المستخدم غير موجود' });
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── Admin user-management routes ─────────────────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.patch('/api/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim())
      return res.status(400).json({ message: 'كلمة المرور الجديدة مطلوبة' });

    const hashed = await bcrypt.hash(newPassword, 10);
    const user = await User.findByIdAndUpdate(req.params.id, { $set: { password: hashed } }, { new: true });
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.patch('/api/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['admin', 'user'].includes(role))
      return res.status(400).json({ message: 'صلاحية غير صحيحة' });

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'المستخدم غير موجود' });
    if (target.email === SEED_ADMIN_EMAIL && role !== 'admin')
      return res.status(400).json({ message: 'لا يمكن إلغاء صلاحية المدير الأساسي' });

    target.role = role;
    await target.save();
    res.json(publicUser(target));
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── Refunds router ───────────────────────────────────────────────────────────
// Every refunds route requires a valid JWT
app.use('/api/refunds', requireAuth, refundRoutes);

// Every /api/consignments* route (all methods, all sub-paths) requires a valid JWT.
// Registered before the individual consignment routes below.
app.use('/api/consignments', requireAuth);

app.get('/api/consignments', async (req, res) => {
  try {
    const query = {};
    const {
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    } = req.query;

    if (companyName) query.companyName = { $regex: companyName, $options: 'i' };
    if (acid) query.acid = { $regex: acid, $options: 'i' };
    if (invoiceSequenceNumber) query.invoiceSequenceNumber = { $regex: invoiceSequenceNumber, $options: 'i' };
    if (consignmentNumber) query.consignmentNumber = { $regex: consignmentNumber, $options: 'i' };
    if (itemName) query.itemName = { $regex: itemName, $options: 'i' };
    if (count) query.count = { $regex: count, $options: 'i' };
    if (supplierName) query.supplierName = { $regex: supplierName, $options: 'i' };
    if (certificateNumber) query.certificateNumber = { $regex: certificateNumber, $options: 'i' };
    if (arrivalPort) query.arrivalPort = { $regex: arrivalPort, $options: 'i' };
    if (fileNumber) query.fileNumber = { $regex: fileNumber, $options: 'i' };

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      Consignment.countDocuments(query),
      Consignment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    res.json({
      data: docs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalRecords: total,
    });
  } catch (err) {
    console.error("GET /api/consignments Error Stack:", err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message, stack: err.stack });
  }
});

app.post('/api/consignments', async (req, res) => {
  try {
    const {
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    } = req.body;

    if (!companyName || !acid)
      return res.status(400).json({ message: 'اسم الشركة ورقم ACID مطلوبان' });

    const doc = await Consignment.create({
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    });

    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'يوجد سجل بهذا الرقم ACID مسبقاً' });
    if (err.name === 'ValidationError')
      return res.status(400).json({
        message: Object.values(err.errors).map((e) => e.message).join(' | '),
      });
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.put('/api/consignments/:id', async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing' });
    const {
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    } = req.body;

    if (!companyName || !acid)
      return res.status(400).json({ message: 'اسم الشركة ورقم ACID مطلوبان' });

    const doc = await Consignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    doc.companyName = companyName;
    doc.acid = acid;
    doc.invoiceSequenceNumber = invoiceSequenceNumber;
    doc.consignmentNumber = consignmentNumber;
    doc.itemName = itemName;
    doc.count = count;
    doc.supplierName = supplierName;
    doc.certificateNumber = certificateNumber;
    doc.arrivalPort = arrivalPort;
    doc.fileNumber = fileNumber;

    await doc.save();
    res.json(doc);
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'يوجد سجل بهذا الرقم ACID مسبقاً' });
    if (err.name === 'ValidationError')
      return res.status(400).json({
        message: Object.values(err.errors).map((e) => e.message).join(' | '),
      });
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.get('/api/consignments/:id', async (req, res) => {
  try {
    const doc = await Consignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.patch('/api/consignments/:id/file', async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing' });

    const { tab, key, url } = req.body;
    if (!tab || !key) return res.status(400).json({ message: 'Missing required fields (tab or key)' });

    if (!['receipts', 'documents'].includes(tab))
      return res.status(400).json({ message: 'بيانات غير صحيحة' });
    if (!/^[A-Za-z0-9_]+$/.test(String(key)))
      return res.status(400).json({ message: 'بيانات غير صحيحة' });

    const isDelete = url === null || url === undefined;
    if (!isDelete && (typeof url !== 'string' || !url.trim()))
      return res.status(400).json({ message: 'بيانات غير صحيحة' });

    // ── Secure deletion: when url is null, destroy the existing asset first ──
    if (isDelete) {
      const existing = await Consignment.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'الشحنة غير موجودة' });

      // Slot may be a legacy string OR a { url, uploadedBy, ... } object
      const existingUrl = Consignment.getSlotUrl(existing[tab]?.[key]);

      if (existingUrl) {
        if (existingUrl.includes('cloudinary.com')) {
          // Extract the public_id from the Cloudinary URL
          // URL format: .../upload/v1234567890/consignments/filename.pdf
          try {
            const afterUpload = existingUrl.split('/upload/')[1];
            // Strip the optional version segment (v<digits>/)
            const withoutVersion = afterUpload.replace(/^v\d+\//, '');
            const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf('.'));
            // PDFs go through /auto/upload and are stored as Cloudinary "image" assets,
            // so destroy with the default resource type (same as the consignment-delete path).
            await cloudinary.uploader.destroy(publicId, { invalidate: true });
            console.log(`🗑️  Cloudinary asset destroyed: ${publicId}`);
          } catch (cldErr) {
            // Non-fatal: log but continue so the DB record is still cleared
            console.error('⚠️  Cloudinary destroy error (non-fatal):', cldErr.message);
          }
        } else if (existingUrl.includes(supabaseUrl)) {
          // Supabase legacy file — derive the storage path and remove it
          try {
            if (supabase) {
              // Path is everything after /object/public/consignments/
              const storagePath = existingUrl.split('/object/public/consignments/')[1];
              if (storagePath) {
                const { error: sbErr } = await supabase.storage
                  .from('consignments')
                  .remove([storagePath]);
                if (sbErr) console.warn('⚠️  Supabase remove error (non-fatal):', sbErr.message);
                else console.log(`🗑️  Supabase file removed: ${storagePath}`);
              }
            }
          } catch (sbErr) {
            console.error('⚠️  Supabase remove error (non-fatal):', sbErr.message);
          }
        }
      }
    }

    // Upload → stamp the uploader from the VERIFIED JWT (req.user). Any uploadedBy /
    // uploadedById sent by the client is ignored. Delete → clear the slot.
    const slotValue = isDelete ? null : Consignment.buildFileSlot(url.trim(), req.user);

    const updatePath = `${tab}.${key}`;
    const doc = await Consignment.findByIdAndUpdate(
      req.params.id,
      { $set: { [updatePath]: slotValue } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.patch('/api/consignments/:id/cleanup', async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing' });

    const { tab, password } = req.body;
    if (!tab) return res.status(400).json({ message: 'Missing required field: tab' });

    if (!['receipts', 'documents'].includes(tab))
      return res.status(400).json({ message: 'قيمة tab غير صحيحة' });
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    const doc = await Consignment.findByIdAndUpdate(
      req.params.id,
      { $set: { [tab]: {} } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    const receiptsEmpty = Object.keys(doc.receipts || {}).length === 0 || Object.values(doc.receipts || {}).every((v) => !Consignment.getSlotUrl(v));
    const documentsEmpty = Object.keys(doc.documents || {}).length === 0 || Object.values(doc.documents || {}).every((v) => !Consignment.getSlotUrl(v));

    if (receiptsEmpty && documentsEmpty) {
      await Consignment.findByIdAndDelete(req.params.id);
      return res.json({ deleted: true });
    }
    res.json({ deleted: false, doc });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.post('/api/consignments/:id/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const { id } = req.params;
    const { tab, key } = req.body;

    if (!tab || !key) return res.status(400).json({ message: "Missing required fields" });
    if (!supabase) throw new Error("Supabase credentials missing on server");

    const storagePath = `${id}/${key}.pdf`;

    const { error } = await supabase.storage
      .from('consignments')
      .upload(storagePath, req.file.buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/consignments/${storagePath}`;

    const updatePath = `${tab}.${key}`;
    const doc = await Consignment.findByIdAndUpdate(
      id,
      { $set: { [updatePath]: Consignment.buildFileSlot(publicUrl, req.user) } },
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: 'Consignment not found' });
    res.status(200).json(doc);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
});



app.delete('/api/consignments/:id', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    // 1. Fetch the document FIRST so we can access the Cloudinary URLs 
    // before it gets deleted from MongoDB.
    const doc = await Consignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    // 2. Delete from MongoDB
    await Consignment.findByIdAndDelete(req.params.id);

    // 3. Supabase Cleanup (Your exact original code)
    try {
      if (!supabase) throw new Error("Supabase credentials missing on server");

      const folder = doc._id.toString();
      const { data: fileList, error: listErr } = await supabase.storage
        .from('consignments')
        .list(folder);

      if (listErr) {
        console.warn('⚠️  Supabase list error:', listErr.message);
      } else if (fileList && fileList.length > 0) {
        const paths = fileList.map((f) => `${folder}/${f.name}`);
        const { error: removeErr } = await supabase.storage
          .from('consignments')
          .remove(paths);
        if (removeErr) console.warn('⚠️  Supabase remove error:', removeErr.message);
        else console.log(`🗑️  Deleted ${paths.length} file(s) from Supabase for "${folder}"`);
      }
    } catch (sbErr) {
      console.error('⚠️  Supabase cleanup error (non-fatal):', sbErr.message);
    }

    // 4. Cloudinary Cleanup — scan all nested URLs in documents & receipts
    try {
      const allUrls = [
        ...Object.values(doc.documents || {}),
        ...Object.values(doc.receipts || {}),
      ]
        .map((slot) => Consignment.getSlotUrl(slot)) // legacy string OR { url, ... } object
        .filter((v) => typeof v === 'string' && v.includes('cloudinary.com'));

      for (const fileUrl of allUrls) {
        try {
          // URL format: .../upload/v<digits>/consignments/filename.pdf
          const afterUpload = fileUrl.split('/upload/')[1];
          const withoutVersion = afterUpload.replace(/^v\d+\//, '');
          const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf('.'));

          await cloudinary.uploader.destroy(publicId, { invalidate: true });
          console.log(`🗑️  Deleted Cloudinary asset: ${publicId}`);
        } catch (innerErr) {
          console.warn(`⚠️  Could not destroy Cloudinary asset for URL ${fileUrl}:`, innerErr.message);
        }
      }
    } catch (cldErr) {
      console.error('⚠️  Cloudinary cleanup error (non-fatal):', cldErr.message);
    }

    res.json({ message: 'تم الحذف بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});
// ─── Server bootstrap ─────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
module.exports = app;