import multer from "multer";

const storage = multer.memoryStorage();

export const uploadImage = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png"].includes(file.mimetype);
    if (!ok) return cb(new Error("Envie uma imagem JPG ou PNG para esta rota."));
    cb(null, true);
  }
});
