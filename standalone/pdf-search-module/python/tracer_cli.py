import json
import sys

from tracer_indexer import TracerIndex


def load_payload():
    raw = sys.stdin.buffer.read().decode("utf-8").strip()
    return json.loads(raw) if raw else {}


def create_index(payload):
    root_path = payload.get("root_path")
    db_path = payload.get("db_path")
    if not root_path:
        raise ValueError("Missing root_path")
    return TracerIndex(root_path=root_path, db_path=db_path)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Missing command")

    command = sys.argv[1]
    payload = load_payload()
    tracer = create_index(payload)

    if command == "stats":
        tracer.sync(force=False)
        result = tracer.get_database_stats()
    elif command == "search":
        tracer.sync(force=False)
        stats = tracer.get_database_stats()
        result = {
            "results": tracer.search_order_codes(payload.get("codes", [])),
            "totalFiles": stats["totalFiles"],
            "totalSizeBytes": stats["totalSizeBytes"],
        }
    elif command == "search-files":
        result = {
            "results": tracer.search_order_codes_in_files(payload.get("items", [])),
        }
    elif command == "page":
        result = tracer.write_single_page(
            relative_path=payload["relative_path"],
            page_number=int(payload["page_number"]),
            output_path=payload["output_path"],
        )
    elif command == "merge":
        result = tracer.merge_pages(payload.get("items", []), payload["output_path"])
    else:
        raise SystemExit(f"Unsupported command: {command}")

    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
