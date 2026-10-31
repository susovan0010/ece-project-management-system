// ========================================================
// ECE Capstone Project Management System - Ingestion & Import Tests
// Verifies parser heuristics, UGR code generation, SDG extraction,
// and duplicate detection logic.
// ========================================================

import { describe, it, expect } from 'vitest';
import {
  predictCategory,
  parseSdgIds,
  processRawImportData,
} from '../lib/import/parser';

describe('Import Engine: Hardware/Software Category Heuristics', () => {
  it('classifies antenna and RF topics as Hardware', () => {
    expect(predictCategory('Design of Dual-Band Microstrip Patch Antenna for 5G')).toBe('Hardware');
  });

  it('classifies FPGA, PCB and sensor topics as Hardware', () => {
    expect(predictCategory('FPGA implementation of real-time acoustic sensor array')).toBe('Hardware');
    expect(predictCategory('Multi-layer PCB fabrication for biomedical monitoring')).toBe('Hardware');
  });

  it('classifies pure software/algorithm topics as Software', () => {
    expect(predictCategory('Web-based Hospital Patient Appointment Portal')).toBe('Software');
    expect(predictCategory('Automated Image Classification and Cloud Data Pipeline')).toBe('Software');
  });

  it('classifies hybrid systems as Both', () => {
    expect(predictCategory('IoT sensor node with deep learning model deployed on cloud')).toBe('Both');
  });
});

describe('Import Engine: SDG Target Extraction', () => {
  it('parses comma-separated SDG numbers', () => {
    expect(parseSdgIds('SDG 7, SDG 9, SDG 11')).toEqual([7, 9, 11]);
    expect(parseSdgIds('7, 11')).toEqual([7, 11]);
  });

  it('ignores numbers outside the 1..17 range', () => {
    expect(parseSdgIds('Goal 3, 2026, 99')).toEqual([3]);
  });

  it('handles empty or undefined inputs gracefully', () => {
    expect(parseSdgIds('')).toEqual([]);
    expect(parseSdgIds(null)).toEqual([]);
    expect(parseSdgIds(undefined)).toEqual([]);
  });
});

describe('Import Engine: Ingestion Normalization & Duplicate Detection', () => {
  it('generates sequential UGR codes and applies category heuristics for UG research', () => {
    const rawRows = [
      { Title: 'Smart Agriculture Soil Moisture Sensor', 'Mapped SDG(s)': 'SDG 2' },
      { Title: 'E-Commerce Recommendation System', 'Mapped SDG(s)': 'SDG 9' },
    ];

    const processed = processRawImportData(rawRows, 'UG_RESEARCH');

    expect(processed.length).toBe(2);
    expect(processed[0].code).toBe('UGR-001');
    expect(processed[0].category).toBe('Hardware'); // mentions sensor
    expect(processed[0].sdgIds).toEqual([2]);

    expect(processed[1].code).toBe('UGR-002');
    expect(processed[1].category).toBe('Software'); // recommendation system
    expect(processed[1].sdgIds).toEqual([9]);
  });

  it('flags duplicate codes and titles', () => {
    const existingCodes = new Set(['SIH26001']);
    const existingTitles = new Set(['automated solar tracker']);

    const rawRows = [
      { 'PS Number': 'SIH26001', Title: 'New Title', Category: 'Hardware' }, // Duplicate code
      { 'PS Number': 'SIH26002', Title: 'Automated Solar Tracker', Category: 'Hardware' }, // Duplicate title
      { 'PS Number': 'SIH26003', Title: 'Unique Project', Category: 'Software' }, // Clean
    ];

    const processed = processRawImportData(rawRows, 'SIH', existingCodes, existingTitles);

    expect(processed[0].isDuplicate).toBe(true);
    expect(processed[0].duplicateReason).toContain('Duplicate Code');

    expect(processed[1].isDuplicate).toBe(true);
    expect(processed[1].duplicateReason).toContain('Duplicate Title');

    expect(processed[2].isDuplicate).toBe(false);
  });

  it('extracts Theme column from Excel import into domain', () => {
    const rawRows = [
      {
        Code: 'SIH26001',
        Title: 'LoRaWAN Based Early Flood Warning System',
        Category: 'Both',
        Theme: 'Disaster Management',
        Description: 'Real-time water level telemetry for flood-prone zones.',
        'Mapped SDG(s)': '11, 13',
      },
      {
        Code: 'SIH26002',
        Title: 'Intelligent V2X Traffic Signal Optimization',
        Category: 'Software',
        Theme: 'Transportation & Logistics',
        Description: 'Adaptive signal control for emergency corridors.',
        'Mapped SDG(s)': '9, 11',
      },
    ];

    const processed = processRawImportData(rawRows, 'SIH');
    expect(processed[0].domain).toBe('Disaster Management');
    expect(processed[1].domain).toBe('Transportation & Logistics');
  });
});
