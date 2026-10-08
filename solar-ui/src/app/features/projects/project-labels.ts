import type { InstallationType, ProjectClassification, SystemConfiguration, WorkScope } from '../../core/models';

export const PROJECT_LABELS: Record<ProjectClassification, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
  agricultural: 'Agricultural',
  'institutional-public': 'Institutional / Public facilities',
  other: 'Other',
};

export const INSTALLATION_LABELS: Record<InstallationType, string> = {
  rooftop: 'Rooftop',
  'ground-mounted': 'Ground-mounted',
  carport: 'Carport',
  other: 'Other',
};

export const CONFIGURATION_LABELS: Record<SystemConfiguration, string> = {
  'grid-tied': 'Grid-tied',
  hybrid: 'Hybrid',
  'off-grid': 'Off-grid',
  undecided: 'Undecided',
};

export const WORK_SCOPE_LABELS: Record<WorkScope, string> = {
  'new-installation': 'New installation',
  expansion: 'Expansion',
  retrofit: 'Retrofit',
  maintenance: 'Maintenance',
};
