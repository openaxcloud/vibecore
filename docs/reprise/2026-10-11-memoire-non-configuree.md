# Mémoire d’agent non configurée — B-13

Fusion réelle de la branche existante sur main après #709, sans conflit. L’erreur conserve le code `AGENT_MEMORY_UNCONFIGURED` et le statut 503, mais porte un message public traduisible décrivant la configuration absente. Aucun service d’embeddings n’est appelé par cette correction.

Quatre tests passent : trois contrats de l’erreur et une lecture de la vraie route API après authentification, en anglais et en français. La réponse ne divulgue ni nom de clé, ni détails PostgreSQL/pgvector. Remplacer uniquement la classe par celle de main rend deux tests rouges, deux restent verts. Types et construction API verts. Lint ciblé vert avec exception à la règle d’alias relative, conforme aux imports NodeNext du service.

Cette branche est préparée ; elle n’est pas servie et ne configure pas la mémoire d’agent en production.
