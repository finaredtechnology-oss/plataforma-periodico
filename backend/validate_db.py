import os
import sys
import socket
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent
env_path = BASE_DIR / '.env'
if not env_path.exists():
    env_path = BASE_DIR.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5435')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_SCHEMA = os.getenv('DB_SCHEMA', 'pdg')

def sanitize_error(err_msg, password):
    if password and password in err_msg:
        return err_msg.replace(password, "********")
    return err_msg

def run_validations():
    print("=== INICIANDO VALIDACIONES DE POSTGRESQL ===")
    
    if not all([DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SCHEMA]):
        print("Error: Variables de configuración de base de datos incompletas.")
        print(f"DB_HOST={DB_HOST}")
        print(f"DB_PORT={DB_PORT}")
        print(f"DB_NAME={DB_NAME}")
        print(f"DB_USER={DB_USER}")
        print("DB_PASSWORD=" + ("********" if DB_PASSWORD else "None"))
        print(f"DB_SCHEMA={DB_SCHEMA}")
        sys.exit(1)

    # 1 & 2. Connectivity & Port Check
    print(f"1 & 2. Verificando conectividad y puerto {DB_HOST}:{DB_PORT}...")
    try:
        s = socket.create_connection((DB_HOST, int(DB_PORT)), timeout=5)
        s.close()
        print("   -> Conectividad exitosa: Puerto accesible.")
    except Exception as e:
        print(f"   -> Fallo: No se pudo conectar al socket. Error: {e}")
        sys.exit(1)

    # Import psycopg
    try:
        import psycopg
    except ImportError:
        print("Error: Biblioteca 'psycopg' no instalada. Ejecute pip install psycopg[binary]")
        sys.exit(1)

    # 3 & 4. Authentication and DB Existence Check
    print(f"3 & 4. Validando credenciales y existencia de base de datos '{DB_NAME}'...")
    try:
        conn = psycopg.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            connect_timeout=5
        )
        print("   -> Conexión y autenticación exitosas.")
    except Exception as e:
        clean_err = sanitize_error(str(e), DB_PASSWORD)
        print(f"   -> Fallo de conexión/autenticación: {clean_err}")
        sys.exit(1)

    try:
        # 7. Ensure read-only mode to prevent any modification
        conn.read_only = True
        with conn.cursor() as cur:
            cur.execute("SET TRANSACTION READ ONLY;")
        print("7. Conexión de validación configurada en READ ONLY.")

        # 5. Schema Existence Check
        print(f"5. Verificando existencia del esquema '{DB_SCHEMA}'...")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT schema_name FROM information_schema.schemata WHERE schema_name = %s;",
                (DB_SCHEMA,)
            )
            row = cur.fetchone()
            if not row:
                print(f"   -> Fallo: El esquema '{DB_SCHEMA}' no existe.")
                conn.close()
                sys.exit(1)
            print(f"   -> Esquema '{DB_SCHEMA}' validado correctamente.")

        # 6. Table Count Check
        print(f"6. Verificando cantidad de tablas (se esperan 54 o 56)...")
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = %s 
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name;
                """,
                (DB_SCHEMA,)
            )
            tables = [r[0] for r in cur.fetchall()]
            table_count = len(tables)
            
            if table_count in [54, 55, 56, 57]:
                print(f"   -> Exitoso: Se encontraron {table_count} tablas en el esquema.")
            else:
                print(f"   -> Fallo: Se encontraron {table_count} tablas en vez de las 54, 55, 56 o 57 esperadas.")
                print(f"   Tablas encontradas: {', '.join(tables) if tables else 'Ninguna'}")
                conn.close()
                sys.exit(1)

        conn.close()
        print("=== TODAS LAS VALIDACIONES DE LA BASE DE DATOS FUERON EXITOSAS ===")
        return True

    except Exception as e:
        clean_err = sanitize_error(str(e), DB_PASSWORD)
        print(f"Error durante las validaciones de metadatos: {clean_err}")
        try:
            conn.close()
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    run_validations()
