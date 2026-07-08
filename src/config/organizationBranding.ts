/**
 * Organization Branding Configuration
 * Maps organization IDs to their logos and branding assets
 */

export interface OrganizationBranding {
  id: string;
  name: string;
  logoUrl: string;
  logoIconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  tagline: string;
}

export const organizationBrandingMap: Record<string, OrganizationBranding> = {
  expertaid: {
    id: 'expertaid',
    name: 'ExpertAid Technologies',
    logoUrl: '/manus-storage/expertaid-logo-full_fdd8c1e6.jpg',
    logoIconUrl: '/manus-storage/expertaid-logo-icon_87095ab9.webp',
    primaryColor: '#5B2C8F', // Purple
    secondaryColor: '#3B9FD9', // Blue
    tagline: 'DESTINY OF EXCELLENCE',
  },
  // Add more organizations here as needed
  // Example:
  // acme: {
  //   id: 'acme',
  //   name: 'ACME Corporation',
  //   logoUrl: '/manus-storage/acme-logo-full.jpg',
  //   logoIconUrl: '/manus-storage/acme-logo-icon.webp',
  //   primaryColor: '#FF0000',
  //   secondaryColor: '#0000FF',
  //   tagline: 'Your Tagline Here',
  // },
};

/**
 * Get branding for an organization
 * Falls back to ExpertAid if organization not found
 */
export function getOrganizationBranding(
  organizationId?: string
): OrganizationBranding {
  if (!organizationId) {
    return organizationBrandingMap.expertaid;
  }

  const normalized = organizationId.toLowerCase().trim();
  return (
    organizationBrandingMap[normalized] || organizationBrandingMap.expertaid
  );
}

/**
 * Get all available organizations
 */
export function getAvailableOrganizations(): OrganizationBranding[] {
  return Object.values(organizationBrandingMap);
}

/**
 * Check if organization exists
 */
export function organizationExists(organizationId: string): boolean {
  return organizationId.toLowerCase() in organizationBrandingMap;
}
