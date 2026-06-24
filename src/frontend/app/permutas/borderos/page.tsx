'use client'

import { BorderosPanel } from '../BorderosPanel'

/** Rota dedicada de Borderôs (deep-link / back-compat). A UI vive em `BorderosPanel`,
 * reutilizada também como aba "Borderôs" na Gestão de Permutas. */
export default function BorderosPage() {
  return <BorderosPanel />
}
