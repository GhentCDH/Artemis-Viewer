// Structural (language-independent) About content: names, institutions, logos,
// links. The translatable prose lives in the i18n dictionaries; team roles are
// dictionary keys so the roster is maintained in exactly one place.
import type { TeamRole } from '$lib/shared/i18n/i18n.svelte';
import { base } from '$app/paths';

export const SITE_TITLE = 'Schelde Gemapt';

export interface TeamMember {
  name: string;
  role: TeamRole;
}

export interface TeamUnit {
  name: string;
  members: TeamMember[];
}

export interface TeamInstitution {
  name: string;
  units: TeamUnit[];
}

export const TEAM: TeamInstitution[] = [
  {
    name: 'Universiteit Gent',
    units: [
      {
        name: 'Ghent Centre for Digital Humanities',
        members: [
          { name: 'Vincent Ducatteeuw', role: 'coordinator' },
          { name: 'Rein Debrulle', role: 'mapDataManagement' },
          { name: 'Fien Danniau', role: 'publicOutreach' },
          { name: 'Christophe Verbruggen', role: 'promotor' },
        ],
      },
      {
        name: 'IDLab',
        members: [
          { name: 'Kenzo Milleville', role: 'machineLearning' },
          { name: 'Fei Fei', role: 'machineLearning' },
          { name: 'Steven Verstockt', role: 'coPromotor' },
        ],
      },
      {
        name: 'ForNaLab',
        members: [{ name: 'Lander Baeten', role: 'coPromotor' }],
      },
    ],
  },
  {
    name: 'Universiteit Antwerpen',
    units: [
      {
        name: 'Centrum voor Stadsgeschiedenis',
        members: [
          { name: 'Iason Jongepier', role: 'promotor' },
          { name: 'Tim Soens', role: 'coPromotor' },
          { name: 'Léa Hermenault', role: 'researcher' },
          { name: 'Sophie Barbaix', role: 'researcher' },
        ],
      },
      {
        name: 'Urban Studies Institute',
        members: [{ name: 'Greet De Block', role: 'coPromotor' }],
      },
      {
        name: 'Antwerp Cultural Heritage Sciences',
        members: [
          { name: 'Yonca Erkan', role: 'coPromotor' },
          { name: 'Piraye Hacigüzeller', role: 'coPromotor' },
        ],
      },
      {
        name: 'Research Centre on Environmental and Social Change',
        members: [{ name: 'Ann Crabbé', role: 'coPromotor' }],
      },
      {
        name: 'ECOSPHERE',
        members: [{ name: 'Stijn Temmerman', role: 'coPromotor' }],
      },
    ],
  },
];

export interface PartnerLogo {
  name: string;
  alt: string;
  /** App-owned static asset path. */
  src: string;
  href: string;
}

export const PARTNER_LOGOS: PartnerLogo[] = [
  { name: 'Universiteit Antwerpen', alt: 'Logo Universiteit Antwerpen', src: `${base}/attribution-logos/Logo_UAntw.jpg`, href: 'https://www.uantwerpen.be' },
  { name: 'KBR', alt: 'Logo KBR', src: `${base}/attribution-logos/logo_KRB.png`, href: 'https://www.kbr.be' },
  { name: 'Nationaal Geografisch Instituut', alt: 'Logo Nationaal Geografisch Instituut', src: `${base}/attribution-logos/logo_NGI.png`, href: 'https://www.ngi.be' },
  { name: 'Rijksarchief', alt: 'Logo Rijksarchief', src: `${base}/attribution-logos/logo_Rijksarchief.png`, href: 'https://www.arch.be' },
  { name: 'Universiteit Gent', alt: 'Logo Universiteit Gent', src: `${base}/attribution-logos/logo_Ugent.png`, href: 'https://www.ugent.be' },
  { name: 'FWO', alt: 'Logo FWO', src: `${base}/attribution-logos/logo_fwo.png`, href: 'https://www.fwo.be' },
];

export const PIPELINE_URL = 'https://github.com/GhentCDH/Artemis-Data';
export const VIEWER_URL = 'https://github.com/GhentCDH/Artemis-Viewer';
