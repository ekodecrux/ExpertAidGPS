import React from 'react';
import { cn } from '../lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  placeholder = "1234567890",
  className,
  id,
  required = false,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only digits and limit to 10 characters
    const numericValue = val.replace(/\D/g, '').slice(0, 10);
    onChange(numericValue);
  };

  return (
    <div className={cn("relative flex items-center group", className)}>
      <div className="absolute left-4 text-slate-400 font-bold text-sm pointer-events-none group-focus-within:text-blue-500 transition-colors">
        +91
      </div>
      <input
        id={id}
        type="tel"
        required={required}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-14 pr-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all"
      />
    </div>
  );
};
