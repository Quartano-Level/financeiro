/**
 * Frontend domain types. The skeleton ships only the Conexos `Filial` shape
 * (mirrors the backend `GET /conexos/filiais` response). Financeiro feature
 * types are added here as the domain is modelled via the pipeline.
 */
export interface Filial {
  filCod: number
  filDesNome: string
  filDocFederalFmt: string
  ufEspSigla?: string
  filVldStatus?: number
}

export interface FiliaisResponse {
  filiais: Filial[]
  filCodDefault: number | null
}
