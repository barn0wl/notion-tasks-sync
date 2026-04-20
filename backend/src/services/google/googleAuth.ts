import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface AuthStatus {
    isAuthenticated: boolean;
    hasValidToken: boolean;
    tokenExpired?: boolean;
    email?: string;
    error?: string;
}

class GoogleAuthService {
    private SCOPES = ['https://www.googleapis.com/auth/tasks'];
    private TOKEN_PATH = path.join(process.cwd(), 'token.json');
    private CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
    private client: OAuth2Client | null = null;
    private tokenExpiryTimer: NodeJS.Timeout | null = null;

    /**
     * Get the authenticated client (initializes if needed)
     */
    async getClient(): Promise<OAuth2Client> {
        if (this.client && this.isClientValid()) {
            return this.client;
        }
        this.client = await this.authorize();
        this.scheduleTokenRefresh();
        return this.client;
    }

    /**
     * Check if current client has a valid token
     */
    private isClientValid(): boolean {
        if (!this.client) return false;
        const credentials = this.client.credentials;
        if (!credentials.access_token) return false;
        
        // Check if token is expired (with 5 min buffer)
        if (credentials.expiry_date) {
            const now = Date.now();
            const buffer = 5 * 60 * 1000; // 5 minutes
            if (now + buffer >= credentials.expiry_date) {
                console.log("Token is expired or about to expire");
                return false;
            }
        }
        return true;
    }

    /**
     * Schedule automatic token refresh before expiration
     */
    private scheduleTokenRefresh(): void {
        if (this.tokenExpiryTimer) {
            clearTimeout(this.tokenExpiryTimer);
            this.tokenExpiryTimer = null;
        }
        
        if (!this.client) return;
        
        const credentials = this.client.credentials;
        if (credentials.expiry_date) {
            const now = Date.now();
            const timeUntilExpiry = credentials.expiry_date - now;
            const refreshBuffer = 10 * 60 * 1000; // Refresh 10 minutes before expiry
            
            if (timeUntilExpiry > refreshBuffer) {
                const refreshDelay = timeUntilExpiry - refreshBuffer;
                console.log(`Scheduling token refresh in ${Math.floor(refreshDelay / 60000)} minutes`);
                
                this.tokenExpiryTimer = setTimeout(async () => {
                    console.log("Refreshing token...");
                    await this.refreshToken();
                }, refreshDelay);
            }
        }
    }

    /**
     * Manually refresh the access token
     */
    async refreshToken(): Promise<boolean> {
        if (!this.client) {
            console.log("No client to refresh");
            return false;
        }
        
        try {
            const credentials = this.client.credentials;
            if (!credentials.refresh_token) {
                console.log("No refresh token available");
                return false;
            }
            
            const { credentials: newCredentials } = await this.client.refreshAccessToken();
            this.client.credentials = newCredentials;
            await this.saveCredentialsToFile(this.client);
            this.scheduleTokenRefresh();
            console.log("Token refreshed successfully");
            return true;
        } catch (error) {
            console.error("Failed to refresh token:", error);
            // Token is invalid, need to re-authenticate
            await this.invalidateToken();
            return false;
        }
    }

    /**
     * Ensure valid authentication before any API call.
     * This will refresh the token if possible, or throw an error requiring re-auth.
     */
    async ensureValidAuth(): Promise<boolean> {
        // Check current status
        const status = await this.checkAuthStatus();
        
        if (status.isAuthenticated && status.hasValidToken) {
            console.log("Auth is valid");
            return true;
        }
        
        // Try to refresh if token is expired
        if (status.tokenExpired || (status.hasValidToken === false && this.client)) {
            console.log("Token appears expired, attempting to refresh...");
            const refreshed = await this.refreshToken();
            if (refreshed) {
                console.log("Token refreshed successfully");
                return true;
            }
        }
        
        // If we got here, we need re-authentication
        console.log("Auth is invalid. User needs to re-authenticate.");
        
        // Generate auth URL for convenience
        const authUrl = await this.getAuthUrl();
        console.log(`Please visit this URL to re-authenticate:\n${authUrl}`);
        
        throw new Error(`Authentication required. Please visit: ${authUrl}`);
    }

    /**
     * Check authentication status without throwing errors
     */
    async checkAuthStatus(): Promise<AuthStatus> {
        try {
            const client = await this.loadSavedCredentialsIfExist();
            
            if (!client) {
                return {
                    isAuthenticated: false,
                    hasValidToken: false,
                    error: "No saved credentials found"
                };
            }
            
            // Try to make a simple API call to verify token works
            const tasks = google.tasks({ version: 'v1', auth: client });
            try {
                await tasks.tasklists.list({ maxResults: 1 });
                return {
                    isAuthenticated: true,
                    hasValidToken: true,
                };
            } catch (apiError: any) {
                if (apiError.code === 401) {
                    return {
                        isAuthenticated: false,
                        hasValidToken: false,
                        tokenExpired: true,
                        error: "Token expired or invalid"
                    };
                }
                return {
                    isAuthenticated: true,
                    hasValidToken: false,
                    error: apiError.message
                };
            }
        } catch (error) {
            return {
                isAuthenticated: false,
                hasValidToken: false,
                error: String(error)
            };
        }
    }

    /**
     * Load saved credentials from file
     */
    async loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
        try {
            const content = await fs.readFile(this.TOKEN_PATH, 'utf-8');
            const credentials = JSON.parse(content);
            const client = google.auth.fromJSON(credentials) as OAuth2Client;
            
            // Check if token is expired
            if (client.credentials.expiry_date && Date.now() >= client.credentials.expiry_date) {
                console.log("Saved token is expired, will refresh");
                // Try to refresh
                try {
                    const { credentials: newCredentials } = await client.refreshAccessToken();
                    client.credentials = newCredentials;
                    await this.saveCredentialsToFile(client);
                    console.log("Expired token refreshed successfully");
                } catch (refreshError) {
                    console.log("Failed to refresh expired token, will re-authenticate");
                    return null;
                }
            }
            
            return client;
        } catch (err) {
            return null;
        }
    }

    /**
     * Save credentials to file
     */
    private async saveCredentialsToFile(client: OAuth2Client): Promise<void> {
        const content = await fs.readFile(this.CREDENTIALS_PATH, 'utf-8');
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: key.client_id,
            client_secret: key.client_secret,
            refresh_token: client.credentials.refresh_token,
            access_token: client.credentials.access_token,
            expiry_date: client.credentials.expiry_date,
        });
        
        await fs.writeFile(this.TOKEN_PATH, payload);
        console.log("Credentials saved to file");
    }

    /**
     * Delete/invalidate the saved token (forces re-authentication)
     */
    async invalidateToken(): Promise<void> {
        try {
            await fs.unlink(this.TOKEN_PATH);
            console.log("Token file deleted");
        } catch (err) {
            // File doesn't exist, that's fine
        }
        this.client = null;
        if (this.tokenExpiryTimer) {
            clearTimeout(this.tokenExpiryTimer);
            this.tokenExpiryTimer = null;
        }
    }

    /**
     * Load or request authorization
     */
    private async authorize(): Promise<OAuth2Client> {
        let client = await this.loadSavedCredentialsIfExist();
        if (client) {
            return client;
        }
        
        console.log("No valid credentials found. Starting OAuth flow...");
        client = await authenticate({
            scopes: this.SCOPES,
            keyfilePath: this.CREDENTIALS_PATH,
        });
        
        if (client.credentials) {
            await this.saveCredentialsToFile(client);
        }
        
        return client;
    }

    /**
     * Get the client ID from credentials file (utility method)
     */
    private async getClientIdFromCredentials(): Promise<{ client_id: string; client_secret: string }> {
        const content = await fs.readFile(this.CREDENTIALS_PATH, 'utf-8');
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        return {
            client_id: key.client_id,
            client_secret: key.client_secret
        };
    }

    /**
     * Get the authorization URL for manual OAuth flow (for web apps)
     * Creates a new OAuth2Client specifically for generating the URL
     */
    async getAuthUrl(): Promise<string> {
        const { client_id, client_secret } = await this.getClientIdFromCredentials();
        
        // Create a new OAuth2 client for generating the auth URL
        const oAuth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            'http://localhost' // redirect URI
        );
        
        return oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.SCOPES,
            prompt: 'consent',
        });
    }

    /**
     * Exchange an authorization code for tokens (for web app callback)
     */
    async exchangeCodeForTokens(code: string): Promise<OAuth2Client> {
        const { client_id, client_secret } = await this.getClientIdFromCredentials();
        
        const oAuth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            'http://localhost'
        );
        
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        
        // Save the credentials
        await this.saveCredentialsToFile(oAuth2Client);
        this.client = oAuth2Client;
        this.scheduleTokenRefresh();
        
        return oAuth2Client;
    }
}

export const googleAuth = new GoogleAuthService();
