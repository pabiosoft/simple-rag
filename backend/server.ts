import app from './app.js';

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🧠 App listening on http://localhost:${PORT}`);
});
