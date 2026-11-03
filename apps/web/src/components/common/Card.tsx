'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';

/** White bordered box. `as` lets a card be an <article>, <section> or <aside> when that's the right meaning. */
interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'article' | 'section' | 'aside';
  children: ReactNode;
}

export function Card({ as: Tag = 'div', className = '', children, ...rest }: CardProps) {
  return (
    <Tag className={`rounded-xl border border-line bg-white p-5 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** The page's <h1>; also sets the browser tab title to the same text. */
export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  usePageTitle(title);
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold text-primary">{title}</h1>
      {intro && <p className="max-w-3xl text-muted">{intro}</p>}
    </div>
  );
}
