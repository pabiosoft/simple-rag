#!/usr/bin/env node

/**
 * Script pour surveiller et traiter les nouveaux fichiers PDF
 * Peut être exécuté manuellement ou en arrière-plan
 * exécuter depuis backend :
 * npm run watch-pdf:dev
 */

import fs from 'fs';
import path from 'path';
import { pdfService } from '../services/pdfService.js';
import { indexerService } from '../services/indexer.js';

const PDF_DIR = path.join(path.resolve('./corpus'), 'pdf');

// Dossier pour suivre les fichiers déjà traités
const PROCESSED_DIR = path.join(path.resolve('./corpus'), 'pdf-processed');

async function ensureProcessedDir() {
    if (!fs.existsSync(PROCESSED_DIR)) {
        fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    }
}

async function getProcessedFiles() {
    if (!fs.existsSync(PROCESSED_DIR)) {
        return new Set();
    }
    
    const files = fs.readdirSync(PROCESSED_DIR);
    return new Set(files.map(f => f.replace('.processed', '')));
}

async function markAsProcessed(fileName) {
    fs.writeFileSync(path.join(PROCESSED_DIR, `${fileName}.processed`), '');
}

async function processNewPDFs() {
    try {
        console.log('🔍 Recherche de nouveaux fichiers PDF...');
        
        await ensureProcessedDir();
        const processedFiles = await getProcessedFiles();
        const allFiles = await pdfService.listPDFFiles();
        
        const newFiles = allFiles.filter(file => !processedFiles.has(file));
        
        if (newFiles.length === 0) {
            console.log('ℹ️ Aucun nouveau fichier PDF trouvé');
            return 0;
        }
        
        console.log(`📄 ${newFiles.length} nouveau(x) fichier(s) PDF trouvé(s):`);
        newFiles.forEach(f => console.log(`  - ${f}`));
        
        const documents = [];
        
        for (const file of newFiles) {
            try {
                const document = await pdfService.processSpecificPDF(file);
                documents.push(document);
                await markAsProcessed(file);
                console.log(`✅ Traité: ${file}`);
            } catch (error) {
                console.error(`❌ Échec ${file}:`, error.message);
            }
        }
        
        if (documents.length > 0) {
            console.log('🔄 Indexation des nouveaux documents...');
            await indexerService.indexDocuments(documents);
            console.log(`✅ ${documents.length} document(s) indexé(s)`);
        }
        
        return documents.length;
        
    } catch (error) {
        console.error('❌ Erreur traitement PDF:', error.message);
        return 0;
    }
}

async function watchPDFDirectory() {
    console.log('👀 Surveillance du dossier PDF...');
    console.log(`Dossier: ${PDF_DIR}`);
    
    // Traiter les fichiers existants
    await processNewPDFs();
    
    // Pour une surveillance continue, vous pourriez utiliser fs.watch
    // Mais pour simplifier, nous allons juste traiter les fichiers une fois
    console.log('\n💡 Pour une surveillance continue, utilisez:');
    console.log('  npm run watch-pdf');
    console.log('\nOu exécutez ce script régulièrement avec cron');
}

// Exécuter le script
watchPDFDirectory();
