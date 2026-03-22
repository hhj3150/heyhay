/**
 * @fileoverview shadcn/ui 유틸리티
 */
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * TailwindCSS 클래스 병합 헬퍼
 * @param {...(string|undefined)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
