import { Category, Product, Supplier } from './models';

// Illustrative fixtures adapted from Stitch, not verified offers or warehouse stock.
export const CATEGORIES: readonly Category[] = ['Panels', 'Inverters', 'Batteries', 'Mounting', 'Protection'];
export const SUPPLIERS: readonly Supplier[] = [
  { id: 'osda', name: 'OSDA Solar', region: 'Ningbo, China', category: 'PV panels', leadDays: 18, orderUnit: '620 panels / container', initials: 'OS' },
  { id: 'srne', name: 'SRNE Solar', region: 'Shenzhen, China', category: 'Inverters & energy storage', leadDays: 21, orderUnit: '10 inverters / order', initials: 'SR' },
  { id: 'anern', name: 'Anern Industry', region: 'Guangzhou, China', category: 'Residential power systems', leadDays: 14, orderUnit: '10 units / order', initials: 'AN' },
  { id: 'alumrax', name: 'AlumRax', region: 'Cebu, Philippines', category: 'Mounting & hardware', leadDays: 4, orderUnit: '10 rail kits / order', initials: 'AR' },
  { id: 'suntree', name: 'Suntree Electric', region: 'Zhejiang, China', category: 'DC protection', leadDays: 10, orderUnit: '20 units / order', initials: 'ST' },
];
export const PRODUCTS: readonly Product[] = [
  { id: 'osda-620', sku: 'OSD-620N-BF', name: '620W N-Type Bifacial Solar Panel', brand: 'OSDA', category: 'Panels', description: 'Dual-glass TOPCon module for residential and commercial arrays.', spec: '620 Wp', secondarySpec: 'N-Type TOPCon', price: 6450, stock: 142, unit: 'panel', depot: 'Bagacay', supplierId: 'osda', visual: 'panel', tiers: [{ quantity: 31, unitPrice: 5890, label: 'Pallet · 31+' }, { quantity: 620, unitPrice: 5350, label: 'Container · 620+' }] },
  { id: 'srne-6200', sku: 'SRN-HF4850S80', name: '6.2kW Hybrid Solar Inverter', brand: 'SRNE', category: 'Inverters', description: '48V hybrid power system with configurable utility and solar priority.', spec: '6.2 kW', secondarySpec: '48V system', price: 34500, stock: 18, unit: 'unit', depot: 'Bagacay', supplierId: 'srne', visual: 'inverter', tiers: [{ quantity: 3, unitPrice: 32200, label: 'Project rate · 3+' }] },
  { id: 'srne-314', sku: 'SRN-LFP-48314', name: '15.1kWh LiFePO4 Battery Bank', brand: 'SRNE', category: 'Batteries', description: 'High-capacity storage with integrated BMS and CAN/RS485 connectivity.', spec: '15.1 kWh', secondarySpec: '314 Ah', price: 148000, stock: 6, unit: 'unit', depot: 'Bagacay', supplierId: 'srne', visual: 'battery', tiers: [{ quantity: 2, unitPrice: 139500, label: 'Dual bank · 2+' }] },
  { id: 'anern-100', sku: 'AN-LFP24100C', name: '2.56kWh Modular LiFePO4 Battery', brand: 'Anern', category: 'Batteries', description: 'Compact 24V battery module for smaller residential backup systems.', spec: '2.56 kWh', secondarySpec: '24V · 100 Ah', price: 23800, stock: 32, unit: 'unit', depot: 'Taclobo', supplierId: 'anern', visual: 'battery', tiers: [{ quantity: 8, unitPrice: 21900, label: 'Bulk · 8+' }] },
  { id: 'rail-6', sku: 'ARX-6P-CORR', name: '6-Panel Corrugated Roof Rail Kit', brand: 'AlumRax', category: 'Mounting', description: 'Aluminum rails, roof feet, and clamps for a six-module installation.', spec: '6-panel row', secondarySpec: 'SUS304 hardware', price: 4150, stock: 64, unit: 'kit', depot: 'Bagacay', supplierId: 'alumrax', visual: 'rail', tiers: [{ quantity: 10, unitPrice: 3700, label: 'Bundle · 10+' }] },
  { id: 'combiner-2', sku: 'STR-DCB-2IN2', name: '2-String DC Combiner Box', brand: 'Suntree', category: 'Protection', description: 'Pre-wired enclosure with surge protection and DC isolation.', spec: '1000V DC', secondarySpec: 'IP65 enclosure', price: 3850, stock: 2, unit: 'unit', depot: 'Bagacay', supplierId: 'suntree', visual: 'combiner', tiers: [{ quantity: 6, unitPrice: 3450, label: 'Carton · 6+' }] },
];
