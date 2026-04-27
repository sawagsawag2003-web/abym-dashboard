# PDF Search Module

Module nay tach rieng chuc nang "Tim kiem PDF" de co the copy sang du an khac.

## Muc tieu

- Frontend React tu chua, khong phu thuoc `components/ui` cua project nay.
- Server helper cho Next.js App Router.
- Python backend khong hardcode `saved_orders`.
- Nguoi dung tu nhap `rootPath` de chi thu muc chua PDF.

## Cau truc

- `frontend/`
  - `PdfSearchModule.tsx`: component React chinh.
  - `types.ts`: cac kieu du lieu dung chung.
- `server/`
  - `tracer-service.ts`: wrapper goi Python CLI.
  - `next-handlers.ts`: helper de dung trong route Next.js.
- `python/`
  - `tracer_cli.py`: CLI JSON qua stdin/stdout.
  - `tracer_indexer.py`: index, tim kiem, tach trang, gop PDF.
  - `requirements.txt`

## Cach tich hop nhanh voi Next.js

1. Copy ca folder nay sang project moi.
2. Cai Python dependency:

```bash
pip install -r standalone/pdf-search-module/python/requirements.txt
```

3. Tao route:

```ts
// app/api/pdf-search/route.ts
import { handlePdfSearchStatsRequest, handlePdfSearchRequest } from "@/standalone/pdf-search-module/server/next-handlers"

export async function GET(request: Request) {
  return handlePdfSearchStatsRequest(request)
}

export async function POST(request: Request) {
  return handlePdfSearchRequest(request)
}
```

```ts
// app/api/pdf-search/page/route.ts
import { handlePdfSearchPageRequest } from "@/standalone/pdf-search-module/server/next-handlers"

export async function GET(request: Request) {
  return handlePdfSearchPageRequest(request)
}
```

```ts
// app/api/pdf-search/merge/route.ts
import { handlePdfSearchMergeRequest } from "@/standalone/pdf-search-module/server/next-handlers"

export async function POST(request: Request) {
  return handlePdfSearchMergeRequest(request)
}
```

4. Render UI:

```tsx
import { PdfSearchModule } from "@/standalone/pdf-search-module/frontend/PdfSearchModule"

export default function Page() {
  return <PdfSearchModule apiBasePath="/api/pdf-search" />
}
```

## Ghi chu

- `rootPath` la thu muc goc chua cac file PDF.
- Database index mac dinh duoc tao tai `<rootPath>/.tracer-index.db`.
- Component hien tai de nguoi dung nhap duong dan bang tay. Sau nay co the thay bang folder picker tuy platform.
