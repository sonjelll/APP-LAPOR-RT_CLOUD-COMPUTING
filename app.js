require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');

const app = express();
const port = process.env.PORT || 80;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Konfigurasi Koneksi Database (Amazon RDS)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Skrip otomatis buat tabel kalau belum ada
const sqlCreateTable = `
    CREATE TABLE IF NOT EXISTS laporan (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nama VARCHAR(255) NOT NULL,
        deskripsi TEXT,
        foto_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;

db.query(sqlCreateTable, (err) => {
    if (err) {
        console.error('Waduh, gagal buat tabel otomatis nih:', err.message);
    } else {
        console.log('Mantap! Tabel "laporan" sudah siap di RDS.');
    }
});

// 2. Konfigurasi AWS S3 Client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Konfigurasi Multer untuk Upload langsung ke S3
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET_NAME,
        metadata: function (req, file, cb) {
            cb(null, {fieldName: file.fieldname});
        },
        key: function (req, file, cb) {
            cb(null, `laporan-${Date.now().toString()}-${file.originalname}`);
        }
    })
});

// ================= FITUR APLIKASI =================

// Fitur 1: Home (Menyajikan Tampilan Dashboard)
app.use(express.static('public')); // Baris ini wajib ada di atas!

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fitur 2 & 3: Submit Laporan beserta Upload Foto Bukti ke S3
app.post('/api/lapor', upload.single('fotoBukti'), (req, res) => {
    const { namaPelapor, deskripsi } = req.body;
    
    if (!req.file) {
        return res.status(400).send('Foto bukti wajib diunggah!');
    }

    // Mengambil nama file yang tersimpan di S3
    const namaFileS3 = req.file.key; 
    
    // Nantinya URL gambar di-generate menggunakan domain CloudFront (Syarat Wajib)
    const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN; 
    const fileUrl = `https://${cloudFrontDomain}/${namaFileS3}`;

    const sql = "INSERT INTO laporan (nama, deskripsi, foto_url) VALUES (?, ?, ?)";
    db.query(sql, [namaPelapor, deskripsi, fileUrl], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Gagal menyimpan laporan ke RDS');
        }
        res.status(200).json({
            pesan: 'Laporan berhasil dikirim!',
            url_foto: fileUrl
        });
    });
});

// Fitur 4: Melihat Data Laporan (Read dari RDS)
app.get('/api/lapor', (req, res) => {
    db.query("SELECT * FROM laporan", (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

app.listen(port, () => {
    console.log(`Aplikasi berjalan di port ${port}`);
});