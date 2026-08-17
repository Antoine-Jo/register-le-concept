# Les 5 ans du Concept

Landing page d'inscription et dashboard administrateur en lecture seule, avec données conservées dans un schéma Supabase privé.

## Architecture de sécurité

Le formulaire public ne possède aucun accès direct à la table :

```text
Navigateur -> Turnstile -> Edge Function -> RPC service_role -> schéma private
```

- aucun SDK ou secret Supabase dans le bundle frontend ;
- aucune politique publique de lecture, insertion, modification ou suppression ;
- validation identique dans l'Edge Function et dans PostgreSQL ;
- contrainte unique sur le prénom et le nom normalisés ;
- limitation à 5 tentatives par empreinte HMAC sur 10 minutes ;
- aucune adresse IP stockée en clair ;
- aucun upload, HTML libre, URL ou champ JSON arbitraire ;
- réponses et logs sans données d'inscription.

Le dashboard suit un second flux :

```text
Lien magique -> session PKCE -> RPC authenticated -> allowlist -> schéma private
```

- inscriptions Auth publiques désactivées ;
- un seul utilisateur créé par un administrateur puis allowlisté par UUID ;
- clé Supabase publishable uniquement dans le navigateur ;
- jetons de session dans `sessionStorage` ;
- déconnexion globale signalée aux autres onglets et JWT limité à 15 minutes ;
- seul le vérificateur PKCE temporaire passe dans `localStorage` pour permettre l'ouverture du lien dans un nouvel onglet ;
- aucune lecture directe de la table, même pour le rôle `authenticated` ;
- RPC bornée à 100 lignes et dashboard sans écriture, suppression ou export.

La clé publique Turnstile et l'URL de l'Edge Function ne sont pas des secrets. `TURNSTILE_SECRET_KEY`, `IP_HASH_SECRET` et `SUPABASE_SERVICE_ROLE_KEY` ne doivent jamais être placés dans une variable `VITE_*`.

## Développement local

Prérequis : Node.js 24 et OrbStack démarré avec le contexte Docker `orbstack`.

```bash
npm install
npx supabase start
```

Les services utilisent volontairement la plage `5532x` pour ne pas entrer en conflit avec d'autres projets Supabase :

- API et Edge Functions : `http://127.0.0.1:55321`
- PostgreSQL : `127.0.0.1:55322`
- Studio : `http://127.0.0.1:55323`
- Mailpit : `http://127.0.0.1:55324`

Créer ou autoriser l'unique administrateur local :

```bash
npm run admin:create -- votre-adresse@example.com
```

Cette commande utilise uniquement les clés administratives locales fournies par Supabase CLI. Elle ne les enregistre dans aucun fichier. La page de connexion se trouve sur `http://localhost:5173/login/` et le lien reçu se consulte dans Mailpit.

Dans un terminal, lancer l'Edge Function avec ses secrets locaux ignorés par Git :

```bash
npx supabase functions serve register --env-file supabase/functions/register/.env.local
```

Dans un second terminal :

```bash
npm run dev
```

Les fichiers `.env.local` fournis localement utilisent exclusivement les clés de test officielles Turnstile. Les modèles de production restent en mode fail-closed dans `.env.example` et `supabase/functions/register/.env.example`. `test.env` est réservé à la CI et ne contient que les identifiants factices publiés par Cloudflare.

### Avertissement réseau local

Supabase CLI publie ses conteneurs sur toutes les interfaces de la machine. Ne laissez pas la stack tourner sur un réseau non fiable et arrêtez-la après utilisation :

```bash
npx supabase stop
```

Les clés locales par défaut, Studio et pgMeta ne sont pas sécurisés comme des services de production.

## Vérifications

```bash
npm test
npm run build
npm audit --audit-level=high
npm run test:db
npm run test:auth
npm run test:function
```

`test:function` nécessite la stack locale démarrée. Il vide uniquement la table locale des compteurs de rate limit, démarre temporairement le worker, puis vérifie les réponses `403`, `201`, `409` et `429`.

`test:auth` crée un utilisateur local éphémère, vérifie le lien Mailpit, PKCE, l'allowlist et le verrouillage des inscriptions publiques, puis supprime cet utilisateur.

Les tests SQL vérifient notamment les privilèges anonymes et authentifiés, l'allowlist, les contraintes, la normalisation, les doublons et le rate limit.

## Passage vers Supabase Cloud

1. Créer un projet dans une région européenne et activer la MFA sur les comptes administrateurs.
2. Activer le fournisseur e-mail Auth, mais désactiver les inscriptions globales et les connexions anonymes.
3. Ne créer aucun bucket Storage ni aucune politique publique.
4. Configurer un SMTP fiable et limiter les URL de redirection Auth au callback exact de production.
5. Créer un widget Turnstile limité aux domaines de production.
6. Lier et migrer la base :

```bash
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase db push
```

7. Préparer localement un fichier ignoré `supabase/functions/register/.env.production` :

```env
ALLOWED_ORIGINS=https://antoine-jo.github.io,https://www.example.fr
IP_HASH_SECRET=une-valeur-aleatoire-longue-et-unique
TURNSTILE_SECRET_KEY=secret-turnstile-de-production
TURNSTILE_HOSTNAMES=antoine-jo.github.io,www.example.fr
TURNSTILE_ALLOW_TEST_RESPONSE=false
```

8. Charger les secrets et déployer la fonction :

```bash
npx supabase secrets set --env-file supabase/functions/register/.env.production
npx supabase functions deploy register --no-verify-jwt
```

9. Créer l'utilisateur administrateur depuis Supabase Auth, puis copier son UUID dans l'allowlist avec l'éditeur SQL :

```sql
insert into private.dashboard_users (user_id)
values ('UUID_DE_L_UTILISATEUR');
```

10. Configurer le build frontend avec des valeurs publiques :

```env
VITE_REGISTRATION_ENDPOINT=https://PROJECT_REF.supabase.co/functions/v1/register
VITE_TURNSTILE_SITE_KEY=cle-publique-turnstile
VITE_BASE_PATH=/register-le-concept/
VITE_CONNECT_SOURCES=https://PROJECT_REF.supabase.co
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=cle-publique-supabase
```

11. Rejouer les tests sur un environnement de préproduction avant d'ouvrir le formulaire.

Le déploiement GitHub Pages n'est volontairement pas automatisé tant que le projet Supabase Cloud et l'hébergeur frontend final ne sont pas choisis. Le mode Pages actuel sert les sources sans build et devra être remplacé par un déploiement de `dist/` avant le prochain push en production.

## Exploitation

Les inscriptions se consultent depuis `/dashboard/` après réception du lien magique par l'adresse allowlistée. L'accès peut être révoqué immédiatement :

```sql
delete from private.dashboard_users
where user_id = 'UUID_DE_L_UTILISATEUR';
```

Le dashboard ne permet aucune modification ni export. Si un export CSV est ajouté ultérieurement, les cellules commençant par `=`, `+`, `-` ou `@` devront être neutralisées avant ouverture dans un tableur.

La production devrait idéalement utiliser un sous-domaine administratif séparé avec CSP en en-tête et `frame-ancestors 'none'`. Sur `antoine-jo.github.io`, tous les projets du compte partagent la même origine ; l'usage de `sessionStorage` réduit l'exposition mais ne remplace pas cette isolation. Ce choix d'hébergement est un prérequis de sécurité à valider avant la publication du dashboard.

Après création du projet Cloud, vérifier manuellement dans Auth que les inscriptions globales et anonymes sont désactivées. `supabase db push` applique les migrations SQL mais ne garantit pas à lui seul ces réglages opérationnels.

Avant publication, compléter l'information RGPD avec l'identité du responsable, le contact, la base légale et une date de suppression. Après l'événement, supprimer les inscriptions selon cette durée de conservation.

## Limite fonctionnelle connue

Sans e-mail ni téléphone, deux homonymes exacts sont indistinguables. Le second recevra un message de doublon et devra contacter l'organisateur.

Ce message de doublon confirme également qu'une combinaison prénom/nom est déjà inscrite. C'est un compromis métier demandé, limité par Turnstile et le rate limit, mais il ne faut pas le considérer comme une preuve d'identité. Avant production, vérifier sur l'environnement Supabase cible que la passerelle remplace bien `x-forwarded-for`, car le rate limit s'appuie sur le dernier proxy de cette chaîne. Une limite d'invocations au niveau de la plateforme reste recommandée en complément.
