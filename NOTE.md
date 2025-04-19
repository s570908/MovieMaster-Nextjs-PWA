# Next.js를 사용하여 PWA(프로그레시브 웹 앱)를 만드는 방법
Ref: https://www.freecodecamp.org/news/how-to-create-a-nextjs-pwa/

# 네트워크 결과의 저장 위치: Cache API vs IndexedDB

서비스 워커 코드에서 네트워크 요청 결과는 두 가지 다른 저장소에 저장되고 있습니다. 각각의 저장소는 특정 유형의 데이터에 최적화되어 있습니다.

## Cache API에 저장되는 항목

1. **정적 자원(Static Resources)**
   - HTML 페이지: 메인 페이지(`/`)
   - 이미지 파일: 로고 이미지(`/imdb-logo.svg`, `/rotten-tomatoes-logo.svg`)
   - 폴백 페이지: (`/fallback`)
   - CSS 및 JavaScript 파일

2. **저장 함수 및 전략**:
   ```javascript
   // 초기 설치 시 핵심 자산 캐싱
   async function cacheCoreAssets() {
     return await cache.addAll(["/", "/imdb-logo.svg", ...]);   }
   
   // 페이지 탐색 요청에 사용
   async function cacheFirstStrategy(request) { ... }
   
   // 일반 리소스 요청에 사용
   async function dynamicCaching(request) { ... }
   ```

3. **응답 형식**: HTTP 요청/응답 쌍 전체가 그대로 저장됨

## IndexedDB에 저장되는 항목

1. **구조화된 데이터(Structured Data)**
   - API 응답 데이터: OMDb API에서 받은 영화 정보
   - JSON 형식의 데이터

2. **저장 함수 및 전략**:
   ```javascript
   // API 요청에 사용
   async function networkFirstStrategy(request) {
     // ...
     const responseData = await responseClone.json();
     await addData(request.url, responseData); // IndexedDB에 저장
     // ...
   }
   
   // 실제 IndexedDB 저장 처리
   async function addData(url, jsonData) { ... }
   ```

3. **응답 형식**: JSON 데이터만 추출하여 저장 (HTTP 헤더 등 제외)

## 명확한 구분 기준

### 1. 요청 유형에 따른 구분

```javascript
self.addEventListener("fetch", (event) => {
    // ...
    
    // OMDb API 요청 -> IndexedDB에 저장
    if (url.origin === "https://www.omdbapi.com") {
        event.respondWith(networkFirstStrategy(request));
    } 
    // 페이지 탐색 -> Cache API에 저장
    else if (event.request.mode === "navigate") {
        event.respondWith(cacheFirstStrategy(request));
    } 
    // 기타 리소스(이미지, 스크립트 등) -> Cache API에 저장
    else {
        event.respondWith(dynamicCaching(request));
    }
});
```

### 2. 데이터 특성에 따른 구분

| 데이터 유형 | 저장소 | 이유 |
|------------|-------|-----|
| **API 데이터(JSON)** | IndexedDB | • 구조화된 데이터 저장에 최적화<br>• 데이터 검색 및 조작이 용이<br>• URL을 키로 사용해 효율적 검색 가능 |
| **페이지 및 정적 자원** | Cache API | • HTTP 요청/응답 캐싱에 최적화<br>• 헤더 및 상태코드 포함 전체 응답 저장<br>• 서비스 워커에서 직접 응답으로 사용 가능 |

### 3. 검색 방식의 차이

- **Cache API**: `cache.match(request)`로 HTTP 요청을 키로 사용하여 검색
- **IndexedDB**: `store.get(url)`로 URL 문자열을 키로 사용하여 검색

이러한 구분을 통해 PWA는 오프라인 환경에서도 최적의 사용자 경험을 제공할 수 있으며, 각 저장소의 강점을 살려 효율적인 데이터 관리를 구현합니다.