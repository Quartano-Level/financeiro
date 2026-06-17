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

    public environment: string;
    public clientName: string;
    public awsRegion: string;

    constructor({
        databaseConnectionString,
        conexosLogin,
        conexosPassword,
        conexosApiUrl,
        conexosFilCod,
        conexosUsnCod,
        supabaseUrl,
        supabaseServiceRoleKey,
        environment,
        clientName,
        awsRegion,
    }: {
        databaseConnectionString: string;
        conexosLogin: string;
        conexosPassword: string;
        conexosApiUrl: string;
        conexosFilCod: number;
        conexosUsnCod: string;
        supabaseUrl?: string;
        supabaseServiceRoleKey?: string;
        environment: string;
        clientName: string;
        awsRegion: string;
    }) {
        this.databaseConnectionString = databaseConnectionString;
        this.conexosLogin = conexosLogin;
        this.conexosPassword = conexosPassword;
        this.conexosApiUrl = conexosApiUrl;
        this.conexosFilCod = conexosFilCod;
        this.conexosUsnCod = conexosUsnCod;
        this.supabaseUrl = supabaseUrl;
        this.supabaseServiceRoleKey = supabaseServiceRoleKey;
        this.environment = environment;
        this.clientName = clientName;
        this.awsRegion = awsRegion;
    }
}
