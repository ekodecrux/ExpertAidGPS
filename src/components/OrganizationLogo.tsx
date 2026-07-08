import React from 'react';
import { getOrganizationBranding } from '../config/organizationBranding';

interface OrganizationLogoProps {
  organizationId?: string;
  variant?: 'full' | 'icon';
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Dynamic Organization Logo Component
 * Displays organization-specific branding based on user's organization
 */
export function OrganizationLogo({
  organizationId,
  variant = 'full',
  className = '',
  size = 'md',
}: OrganizationLogoProps) {
  const branding = getOrganizationBranding(organizationId);

  const sizeClasses = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16',
    xl: 'h-24',
  };

  const logoUrl =
    variant === 'full' ? branding.logoUrl : branding.logoIconUrl;

  return (
    <img
      src={logoUrl}
      alt={`${branding.name} Logo`}
      className={`${sizeClasses[size]} object-contain ${className}`}
      loading="lazy"
    />
  );
}

/**
 * Organization Logo with Tagline
 * Shows logo and organization tagline
 */
export function OrganizationLogoWithTagline({
  organizationId,
  className = '',
}: {
  organizationId?: string;
  className?: string;
}) {
  const branding = getOrganizationBranding(organizationId);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <img
        src={branding.logoUrl}
        alt={`${branding.name} Logo`}
        className="h-20 w-auto"
        loading="lazy"
      />
      <p className="text-xs font-semibold text-center text-gray-600">
        {branding.tagline}
      </p>
    </div>
  );
}

/**
 * Organization Icon Only
 * Minimal logo icon for headers and navigation
 */
export function OrganizationIcon({
  organizationId,
  className = '',
  size = 'md',
}: {
  organizationId?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const branding = getOrganizationBranding(organizationId);

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  return (
    <img
      src={branding.logoIconUrl}
      alt={`${branding.name} Icon`}
      className={`${sizeClasses[size]} rounded ${className}`}
      loading="lazy"
    />
  );
}

/**
 * Organization Branding Context Display
 * Shows full branding information
 */
export function OrganizationBrandingDisplay({
  organizationId,
  className = '',
}: {
  organizationId?: string;
  className?: string;
}) {
  const branding = getOrganizationBranding(organizationId);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-4">
        <img
          src={branding.logoUrl}
          alt={`${branding.name} Logo`}
          className="h-16 w-auto"
          loading="lazy"
        />
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {branding.name}
          </h2>
          <p className="text-sm text-gray-600">{branding.tagline}</p>
        </div>
      </div>
    </div>
  );
}
