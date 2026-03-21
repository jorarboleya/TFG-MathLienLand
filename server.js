const express = require('express');
const path = require('path');

const app = express();
const PORT = 8080;

// Cabeceras necesarias para que Godot HTML5 funcione (SharedArrayBuffer)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
