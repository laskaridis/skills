# ADR 0001: Basket persistence and expiry

Status: accepted

Baskets are persisted server-side for both Guests and Customers, keyed by owner id
(session id for Guests, customer id for Customers). Baskets are never stored in the
browser. A Basket that has not been modified for 30 days expires and is deleted.
Expiry is enforced by `Basket.isExpired()`; there is no user-facing expiry warning.
