# Components

Ce dossier contient les composants React réutilisables de l'application.

## Structure

Les composants partagés entre plusieurs routes doivent être placés ici.

Pour les composants spécifiques à une route, ils peuvent rester dans le même fichier que la route ou dans un sous-dossier de la route.

## Exemple

```tsx
// app/components/Button.tsx
export function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}
```

