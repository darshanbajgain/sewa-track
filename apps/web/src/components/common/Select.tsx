'use client';

import * as RadixSelect from '@radix-ui/react-select';
import { useId } from 'react';
import { describedBy, FieldShell, fieldClasses } from './FormField';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  label: string;
  value: string; // '' = nothing chosen (shows the placeholder) or the "All" option
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  hint?: string | undefined;
  error?: string | undefined;
  id?: string;
  required?: boolean;
  disabled?: boolean;
}

// Radix reserves '' for "nothing chosen", so an option can't use it. Our filters use '' for "All",
// so it is swapped for this placeholder value inside the component; callers never see it.
const EMPTY = '__empty__';
const toRadix = (value: string) => (value === '' ? EMPTY : value);
const fromRadix = (value: string) => (value === EMPTY ? '' : value);

/**
 * Dropdown built on Radix Select (replaces the browser's native <select>, which can't be styled).
 * Why Radix: the menu is rendered in a portal at the end of <body> and positioned against the button, so it
 * is never cut off by a card or covered by the map, and it flips above the button when there is no room
 * below (`avoidCollisions`). Keyboard (arrows, typing to jump, Esc) and screen-reader roles come built in.
 * Same label / hint / error wiring as the other fields (FieldShell).
 */
export function SelectField({ label, value, onChange, options, placeholder, hint, error, id: idProp, required, disabled }: SelectFieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  const hasEmptyOption = options.some((o) => o.value === '');
  // Root value '' tells Radix "nothing chosen" and shows the placeholder.
  const rootValue = value === '' && !hasEmptyOption ? '' : toRadix(value);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <RadixSelect.Root value={rootValue} onValueChange={(v) => onChange(fromRadix(v))} disabled={disabled} required={required}>
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={`${fieldClasses(error)} flex items-center justify-between gap-2 text-left data-[placeholder]:text-muted data-[state=open]:border-primary data-[state=open]:ring-4 data-[state=open]:ring-primary/20`}
        >
          <span className="truncate">
            <RadixSelect.Value placeholder={placeholder} />
          </span>
          <RadixSelect.Icon className="shrink-0 text-muted">
            <Chevron />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          {/*
            popper = drop down under the button (like a menu), as wide as the button, as tall as the space allows.
            z-[1100]: above Leaflet's map panes and controls (up to 1000) and above the Modal (z-50).
          */}
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            collisionPadding={8}
            className="z-[1100] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-40 overflow-hidden rounded-md border border-line bg-white shadow-lg"
          >
            <RadixSelect.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
              <Chevron up />
            </RadixSelect.ScrollUpButton>
            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={toRadix(option.value)}
                  disabled={option.disabled}
                  className="relative flex min-h-10 cursor-pointer select-none items-center rounded py-2 pr-8 pl-3 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary data-[state=checked]:font-semibold"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="absolute right-2 text-primary">
                    <Check />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
            <RadixSelect.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
              <Chevron />
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </FieldShell>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={up ? 'rotate-180' : undefined}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
