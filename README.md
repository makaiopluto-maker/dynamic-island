# Dynamic Island for Windows

윈도우 바탕화면 위에 얹는 글래스 아일랜드입니다. 검은 알약을 누르면 홈으로 펼쳐지고, 음악·AI·라디오·메일·일정이 그 안에서 이어집니다.

## 실행

```bash
npm install
npm run dev
```

개발 서버는 [http://127.0.0.1:4731](http://127.0.0.1:4731) 입니다. 공개 페이지는 [https://makaiopluto-maker.github.io/dynamic-island/](https://makaiopluto-maker.github.io/dynamic-island/) 입니다.

## 조작

- 알약을 클릭하면 홈이 펼쳐집니다. 가운데 주황 점이나 바깥을 누르면 접힙니다. 시간 옆 `···`은 메뉴입니다.
- 아래 독에서 Home, Music, AI, Radio로 이동합니다. 양쪽 `+`는 설정입니다.
- YouTube Music은 목록에서 곡을 고르거나 검색창에서 Enter로 찾습니다.
- 라디오는 뉴스 채널과 음량 슬라이더를 씁니다.
- AI는 Gemini로 답합니다. Enter로 메시지를 보냅니다. PC에서 큰 모델을 돌리지 않아 멈추지 않습니다.
- `1` `2` `3` `4`는 홈, 음악, AI, Radio입니다. `Esc`는 한 단계씩 접습니다.

## 연결된 것들

- **날씨**는 서울 기온입니다.
- **메일 · 캘린더 · Google Photos**는 Google로 로그인만 하면 바로 씁니다. Client ID를 따로 넣을 필요가 없습니다.
- **음악**은 YouTube Music / Spotify입니다.
- **라디오**는 YTN, KBS 1라디오, MBC 표준FM, CBS 표준FM, SBS 러브FM, TBS 교통방송입니다.
- **AI**는 Gemini입니다. 배포 환경에 키가 있으면 바로 채팅하고, 없으면 Google AI Studio 키를 한 번만 저장합니다.
- **조명**은 윈도우 설치본에서만 모니터 밝기를 바꿉니다.

## 윈도우 설치 파일

`Dynamic-Island-Setup.exe`를 받아 설치합니다. 이미 설치되어 있으면 같은 파일로 제거하거나 다시 설치할 수 있습니다. 설치 후 검은 알약이 화면 맨 위 가운데에 붙고, 트레이에서 다시 보이거나 끝낼 수 있습니다.

```bash
npm run dist:win
```

결과물은 `release/Dynamic-Island-Setup.exe` 입니다. Google 로그인·Gemini를 설치본에 넣으려면 빌드 전에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`를 환경에 두면 `electron/seed-google.mjs`가 시드 파일을 만듭니다.
