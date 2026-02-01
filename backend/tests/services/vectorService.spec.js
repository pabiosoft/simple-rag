import { describe, it, expect } from 'vitest';
import { VectorService } from '../../services/vector.js';

describe('VectorService#getAdaptiveThreshold', () => {
    const service = new VectorService();

    it('applique un seuil bas pour les requêtes très courtes', () => {
        expect(service.getAdaptiveThreshold('IA ?')).toBeCloseTo(0.72);
    });

    it('augmente progressivement avec la longueur', () => {
        expect(service.getAdaptiveThreshold('Plan marketing IA 2025')).toBeCloseTo(0.77);
        expect(service.getAdaptiveThreshold('Comment optimiser notre conversion e-commerce sur mobile ?'))
            .toBeCloseTo(0.8);
    });

    it('cappe à 0.82 au-delà de 12 mots', () => {
        const longQuestion = 'Peux-tu synthétiser les résultats de satisfaction client collectés sur les trois derniers trimestres pour préparer le comité exécutif';
        expect(service.getAdaptiveThreshold(longQuestion)).toBeCloseTo(0.82);
    });
});
