"""Optional CLI. Configuration stays in environment variables."""
import argparse
import json
import sys

from moneygraph.investigator import investigate, InvestigatorUnavailable


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("question")
    args = parser.parse_args()
    try:
        result = investigate(args.question)
    except (InvestigatorUnavailable, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 2
    except Exception:
        print("OpenAI request failed; check model access, credentials and network.", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
