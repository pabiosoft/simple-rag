import { indexerService } from './services/indexer.js';

const targetSubdir = process.argv[2];

const run = async () => {
    if (targetSubdir) {
        await indexerService.indexPdfSubdir(targetSubdir);
    } else {
        await indexerService.reindexCorpus();
    }
};

run()
    .then(() => console.log('✅ Indexation terminée avec succès.'))
    .catch(error => {
        console.error('❌ Erreur globale:', error);
        process.exit(1);
    });
