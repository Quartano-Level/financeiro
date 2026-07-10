export default class EnvironmentVars {
    public databaseConnectionString: string;
    public conexosLogin: string;
    public conexosPassword: string;
    public conexosApiUrl: string;
    public conexosFilCod: number;
    /**
     * Legacy single-tenant fallback for `cnx-usncod`. The canonical value
     * is captured at runtime from the Conexos `/login` response (PR #19);
     * this field is only consumed when no live session is available.
     */
    public conexosUsnCod: string;

    public supabaseUrl?: string;
    public supabaseServiceRoleKey?: string;

    /**
     * HS256 secret used to SIGN the app's own login JWTs (read from
     * `AUTH_JWT_SECRET`). The auth middleware validates these tokens with the
     * same secret (`SUPABASE_JWT_SECRET`/`AUTH_JWT_SECRET`). Optional so local
     * dev (DEV_AUTH_BYPASS) can boot before it is provisioned.
     */
    public authJwtSecret?: string;

    public environment: string;
    public clientName: string;
    public awsRegion: string;

    /**
     * Chave-mestra (base64, 32 bytes) para cifrar/decifrar a senha Conexos de
     * cada usuário (AES-256-GCM) — vínculo por-usuário (Fatia B). É um segredo
     * REVERSÍVEL (a senha precisa ser reusada no login do ERP), então não é hash.
     * Opcional: ausente ⇒ o cadastro de credencial Conexos fica indisponível e
     * todos operam via robô (o vínculo por-usuário exige a chave).
     */
    public conexosCredEncKey?: string;

    /**
     * Fase 3 (ADR-0013) — guard-rails da ESCRITA no `fin010`. `conexosWriteEnabled`
     * liga o caminho de escrita (default false); `conexosDryRun` (default true) faz o
     * serviço montar/logar o payload SEM POST. Escrita real exige write=true E dry=false.
     * Toggles de deploy (não segredos por-tenant) — lidos de process.env em ambos os modos.
     */
    public conexosWriteEnabled: boolean;
    public conexosDryRun: boolean;

    constructor({
        databaseConnectionString,
        conexosLogin,
        conexosPassword,
        conexosApiUrl,
        conexosFilCod,
        conexosUsnCod,
        supabaseUrl,
        supabaseServiceRoleKey,
        authJwtSecret,
        environment,
        clientName,
        awsRegion,
        conexosWriteEnabled,
        conexosDryRun,
        conexosCredEncKey,
    }: {
        databaseConnectionString: string;
        conexosLogin: string;
        conexosPassword: string;
        conexosApiUrl: string;
        conexosFilCod: number;
        conexosUsnCod: string;
        supabaseUrl?: string;
        supabaseServiceRoleKey?: string;
        authJwtSecret?: string;
        environment: string;
        clientName: string;
        awsRegion: string;
        conexosWriteEnabled: boolean;
        conexosDryRun: boolean;
        conexosCredEncKey?: string;
    }) {
        this.databaseConnectionString = databaseConnectionString;
        this.conexosLogin = conexosLogin;
        this.conexosPassword = conexosPassword;
        this.conexosApiUrl = conexosApiUrl;
        this.conexosFilCod = conexosFilCod;
        this.conexosUsnCod = conexosUsnCod;
        this.supabaseUrl = supabaseUrl;
        this.supabaseServiceRoleKey = supabaseServiceRoleKey;
        this.authJwtSecret = authJwtSecret;
        this.environment = environment;
        this.clientName = clientName;
        this.awsRegion = awsRegion;
        this.conexosWriteEnabled = conexosWriteEnabled;
        this.conexosDryRun = conexosDryRun;
        this.conexosCredEncKey = conexosCredEncKey;
    }
}
