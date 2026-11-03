'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Spinner } from './Spinner';

/**
 * One button style system for the whole app.
 *   variant: primary (main action) · accent (crimson highlight, e.g. Log in) · secondary (outline) ·
 *            danger (destructive) · ghost (quiet)
 *   size:    md (44px, the minimum comfortable touch target) · lg (48px)
 * `ButtonLink` looks identical but navigates (a real <a>), so screen readers announce it as a link.
 */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  accent: 'bg-accent text-white hover:brightness-90',
  secondary: 'border-2 border-primary bg-white text-primary hover:bg-primary-soft',
  danger: 'border-2 border-accent bg-white text-accent hover:bg-accent-soft',
  ghost: 'text-primary hover:bg-primary-soft',
};
const SIZE: Record<ButtonSize, string> = { md: 'min-h-11 px-4 text-sm', lg: 'min-h-12 px-6 text-base' };

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `inline-flex items-center justify-center gap-2 rounded-md font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean; // disables the button and shows a spinner while a request runs
  children: ReactNode;
}

export function Button({ variant, size, loading = false, disabled, className = '', type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button
      type={type} // default "button", so a button inside a form never submits it by accident
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

export function ButtonLink({ variant, size, className = '', ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
