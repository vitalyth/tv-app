"use client";

import { memo, useCallback, useEffect, useState, useTransition, type ChangeEvent, type KeyboardEvent } from "react";
import { Search } from "lucide-react";

interface DebouncedSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  delayMs?: number;
}

export const DebouncedSearchInput = memo(function DebouncedSearchInput({
  value,
  onChange,
  placeholder,
  className = "relative w-full lg:w-96",
  delayMs = 1000,
}: DebouncedSearchInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const commitSearch = useCallback(() => {
    const nextValue = inputValue.trim();
    if (nextValue === value) return;

    startTransition(() => onChange(nextValue));
  }, [inputValue, onChange, startTransition, value]);

  useEffect(() => {
    const timeoutId = window.setTimeout(commitSearch, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [commitSearch, delayMs]);

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitSearch();
    }
  }, [commitSearch]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={commitSearch}
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        title="חיפוש"
      >
        <Search className="h-4 w-4" />
      </button>
      <input
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card py-2.5 pr-11 pl-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
});
