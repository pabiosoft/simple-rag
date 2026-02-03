import fs from 'fs';
import path from 'path';

const CORPUS_DIR = path.resolve('./corpus');
const EXCEL_DIR = path.join(CORPUS_DIR, 'excel');
const JSON_DIR = path.join(CORPUS_DIR, 'json');
const PDF_DIR = path.join(CORPUS_DIR, 'pdf');

const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls']);
const JSON_EXTENSIONS = new Set(['.json']);
const PDF_EXTENSIONS = new Set(['.pdf']);

const TYPE_CONFIG = {
    excel: { dir: EXCEL_DIR, extensions: EXCEL_EXTENSIONS },
    json: { dir: JSON_DIR, extensions: JSON_EXTENSIONS },
    pdf: { dir: PDF_DIR, extensions: PDF_EXTENSIONS },
};

class CorpusService {
    getExcelDir() {
        return EXCEL_DIR;
    }

    async ensureExcelDir() {
        await this.ensureDirForType('excel');
    }

    async ensureDirForType(type) {
        const config = TYPE_CONFIG[type];
        if (!config) {
            throw new Error(`Type de fichier non supporté: ${type}`);
        }
        if (!fs.existsSync(config.dir)) {
            await fs.promises.mkdir(config.dir, { recursive: true });
        }
    }

    getDirForType(type) {
        const config = TYPE_CONFIG[type];
        if (!config) {
            throw new Error(`Type de fichier non supporté: ${type}`);
        }
        return config.dir;
    }

    detectFileType(fileName) {
        const ext = path.extname(fileName).toLowerCase();

        for (const [type, config] of Object.entries(TYPE_CONFIG)) {
            if (config.extensions.has(ext)) {
                return type;
            }
        }

        throw new Error(`Extension de fichier non supportée: ${ext || 'inconnue'}`);
    }

    resolveDestination(fileName) {
        const type = this.detectFileType(fileName);
        const dir = this.getDirForType(type);
        return { type, dir };
    }

    async listExcelFiles() {
        await this.ensureExcelDir();

        const entries = await fs.promises.readdir(EXCEL_DIR, { withFileTypes: true });

        return entries
            .filter(entry => entry.isFile())
            .map(entry => entry.name)
            .filter(name => EXCEL_EXTENSIONS.has(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b));
    }

    async ensureReadable(filePath) {
        try {
            await fs.promises.chmod(filePath, 0o644);
        } catch (error) {
            console.warn(`⚠️ Impossible de mettre à jour les permissions de ${filePath}: ${error.message}`);
        }
    }
}

export const corpusService = new CorpusService();
