# Prevent overselling with an atomic conditional decrement in PostgreSQL

Checkout reserves Stock inside one database transaction using `UPDATE variant SET stock = stock - :n WHERE id = :id AND stock >= :n`; zero rows updated means out of stock. Cancel and expiry increment it back. We rejected read-then-write in application code (races under concurrent checkouts) and Redis locks or queues (extra infrastructure for no gain at MVP scale). It stays correct with multiple API instances.
