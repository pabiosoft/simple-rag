import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import cors from 'cors';
import { appConfig, secrets } from './config/runtime/appConfig.js';

// Services
import { vectorService } from './services/vector.js';
import chatRoutes from './routes/chat.js';
import corpusRoutes from './routes/corpus.js';
import pdfRoutes from './routes/pdf.js';
import adminRoutes from './routes/admin.js';
import { apiAuth, isSameOriginRequest } from './middleware/auth.js';
import { isAdminAuthConfigured, isAdminSessionValid } from './middleware/adminSession.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve();

// Utiliser le PORT depuis .env avec fallback
const PORT = appConfig.port;
const adminBase = appConfig.adminPath;
const adminUiBase = appConfig.adminUiPath || adminBase;
const enableChatUI = appConfig.enableChatUI;

// Vérification des variables d'environnement
if (!secrets.openaiApiKey) {
    console.error('❌ OPENAI_API_KEY non défini dans .env');
    process.exit(1);
} 

const app = express();

const allowedOrigins = appConfig.allowedOrigins || [];
const allowAnyOrigin = allowedOrigins.length === 0;


const corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (allowAnyOrigin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
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
app.use(express.static(path.join(appRoot, 'public')));
app.use('/corpus/excel', express.static(path.join(appRoot, 'corpus', 'excel')));
app.set('view engine', 'pug');
app.set('views', path.join(appRoot, 'views'));

// Routes
app.get('/', (_, res) => {
    res.render('index', { adminBase, enableChatUI });
});

app.get(adminUiBase, (req, res) => {
    const adminAuthEnabled = isAdminAuthConfigured();
    res.render('admin', {
        adminAuthEnabled,
        adminAuthed: adminAuthEnabled ? isAdminSessionValid(req) : true,
        adminBase,
        adminUiBase,
    });
});

// Routes API
app.use('/ask', (req, res, next) => {
    if (isSameOriginRequest(req)) {
        return next();
    }
    return apiAuth(req, res, next);
});
app.use('/corpus', (req, res, next) => {
    if (isAdminAuthConfigured() && isAdminSessionValid(req)) {
        return next();
    }
    return apiAuth(req, res, next);
});
app.use('/pdf', apiAuth);
app.use(`${adminBase}/api`, (req, res, next) => {
    if (isAdminAuthConfigured() && isAdminSessionValid(req)) {
        return next();
    }
    return apiAuth(req, res, next);
});

app.use('/', chatRoutes);
app.use('/', corpusRoutes);
app.use('/', pdfRoutes);
app.use(adminUiBase, adminRoutes);

// 404
app.use((req, res) => {
    res.status(404).render('404', { adminBase: adminUiBase, enableChatUI });
});

// Démarrage du serveur
export default app;
