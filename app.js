require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise'); // Pakai versi promise biar lebih rapi
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');

const app = express();
const port = process.env.PORT || 80;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 

// 1. Inisialisasi Database & Tabel (Jalur Otomatis)
async function initDatabase() {
    // Koneksi awal tanpa nama database agar tidak Access Denied
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        // Buat Database sendiri kalau belum ada
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'laporrt_db'}\`;`);
        console.log(`✅ Database siap.`);

        // Gunakan database tersebut
        await connection.query(`USE \`${process.env.DB_NAME || 'laporrt_db'}\`;`);

        // Buat Tabel Laporan
        const sqlCreateTable = `
            CREATE TABLE IF NOT EXISTS laporan (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nama VARCHAR(255) NOT NULL,
                deskripsi TEXT,
                foto_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await connection.query(sqlCreateTable);
        console.log('✅ Tabel "laporan" siap di RDS.');
    } catch (err) {
        console.error('❌ Gagal inisialisasi DB:', err.message);
    } finally {
        await connection.end();
    }
}

// 2. Pool Koneksi untuk Fitur Aplikasi (Pakai mysql2 standar)
const mysqlStandard = require('mysql2');
const db = mysqlStandard.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'laporrt_db',
});

// Jalankan Inisialisasi
initDatabase();

// 3. Konfigurasi AWS S3 Client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET_NAME,
        metadata: (req, file, cb) => { cb(null, {fieldName: file.fieldname}); },
        key: (req, file, cb) => {
            cb(null, `laporan-${Date.now().toString()}-${file.originalname}`);
        }
    })
});

// ================= FITUR APLIKASI =================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/lapor', upload.single('fotoBukti'), (req, res) => {
    const { namaPelapor, deskripsi } = req.body;
    if (!req.file) return res.status(400).send('Foto bukti wajib diunggah!');

    const fileUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${req.file.key}`;
    const sql = "INSERT INTO laporan (nama, deskripsi, foto_url) VALUES (?, ?, ?)";
    
    db.query(sql, [namaPelapor, deskripsi, fileUrl], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Gagal simpan ke RDS');
        }
        res.status(200).json({ pesan: 'Laporan terkirim!', url_foto: fileUrl });
    });
});

app.get('/api/lapor', (req, res) => {
    db.query("SELECT * FROM laporan ORDER BY created_at DESC", (err, results) => {
        if (err) return res.status(500).json({ error: "Database belum siap" });
        res.json(results);
    });
});

app.listen(port, () => {
    console.log(`🚀 LaporRT Suci meluncur di port ${port}`);
});