import fs from 'fs';
import path from 'path';

const CORPUS_DIR = path.resolve('./corpus');
const EXCEL_DIR = path.join(CORPUS_DIR, 'excel');
const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xls']);

class CorpusService {
    getExcelDir() {
        return EXCEL_DIR;
    }

    async ensureExcelDir() {
        if (!fs.existsSync(EXCEL_DIR)) {
            await fs.promises.mkdir(EXCEL_DIR, { recursive: true });
        }
    }

    async listExcelFiles() {
        await this.ensureExcelDir();

        const entries = await fs.promises.readdir(EXCEL_DIR, { withFileTypes: true });

        return entries
            .filter(entry => entry.isFile())
            .map(entry => entry.name)
            .filter(name => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b));
    }
}

export const corpusService = new CorpusService();
