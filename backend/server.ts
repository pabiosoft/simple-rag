import app from './app.js';
import { appConfig } from './config/appConfig.js';

const PORT = appConfig.port;

app.listen(PORT, () => {
  console.log(`🧠 App listening on http://localhost:${PORT}`);
});
