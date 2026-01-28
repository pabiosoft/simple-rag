import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';

// Services
import { vectorService } from './services/vector.js';
import chatRoutes from './routes/chat.js';
import corpusRoutes from './routes/corpus.js';
import pdfRoutes from './routes/pdf.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utiliser le PORT depuis .env avec fallback
const PORT = process.env.PORT || 8000;

// Vérification des variables d'environnement
if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY non défini dans .env');
    process.exit(1);
} 

const app = express();

const allowedOrigins = [
    'http://localhost:3000','http://localhost:8000',
];

const dashlabPattern = /^https?:\/\/([a-z0-9-]+\.)*dashlab\.fr(?::\d+)?$/i;

const corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || dashlabPattern.test(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
};

app.use(cors(corsOptions));

// Vérification de la connexion Qdrant au démarrage
async function checkConnections() {
    const isConnected = await vectorService.checkConnection();
    if (!isConnected) {
        process.exit(1);
    }
}
checkConnections();

// Middlewares
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/corpus/excel', express.static(path.join(__dirname, 'corpus', 'excel')));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (_, res) => {
    res.render('index');
});

// Routes API
app.use('/', chatRoutes);
app.use('/', corpusRoutes);
app.use('/', pdfRoutes);

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🧠 App listening on http://localhost:${PORT}`);
});
