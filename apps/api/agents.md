@pair-programming.md
## API directive

### schema generation guides

use snake_case for table names
tables should always be in singular (user over users)
dont use ambiguous column names
be descriptive and specific
avoid reserved keywords (order for example)
use prefix for boolean fields
date and timestamp add suffix \_date or \_at
consistent naming for id (id for primary_key and products_id for foreign_key, public_id for a public facing identifier since id is not to be exposed in client, to prevent possible enumerations)

## Practical pattern

Keep id as the PK used for relations and joins.
Add public_id as a UNIQUE indexed column for external use; generate server-side with NanoID and never expose the internal id.
Use public_id for public APIs/URLs; use id for internal queries and FK references.

## migrations generation

do not write the migrations manually let drizzle create the migrations files via the command `pnpm --filer api db:generate`. only write the schema in the orm with typescript
