import type { HTMLAttributes, ReactNode } from 'react';

/** White bordered box. `as` lets a card be an <article> or <section> when that's the right meaning. */
interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'article' | 'section';
  children: ReactNode;
}

export function Card({ as: Tag = 'div', className = '', children, ...rest }: CardProps) {
  return (
    <Tag className={`rounded-xl border border-line bg-white p-5 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold text-primary">{title}</h1>
      {intro && <p className="max-w-3xl text-muted">{intro}</p>}
    </div>
  );
}
