# 앱 업데이트 안내 운영

업데이트 창은 해당 코드를 포함한 앱부터 동작한다. 현재 제출된 빌드가 이 코드보다 먼저 만들어졌다면 그 빌드에는 소급 적용되지 않으며, 다음 네이티브 빌드에 포함해야 한다.

## 공개 순서

1. 앱의 iOS `MARKETING_VERSION`과 Android `versionName`을 새 버전으로 올린다.
2. Codemagic에서 빌드해 각 스토어에 제출한다.
3. 심사 통과뿐 아니라 사용자가 실제 스토어에서 새 버전을 받을 수 있는지 확인한다.
4. 공개된 플랫폼의 최신 버전만 운영 DB에서 올린다.

```sql
-- iOS 1.2가 App Store에 실제 공개된 뒤
update public.app_config
set ios_latest_version = '1.2'
where id = 1;

-- Android 1.2가 Google Play에 실제 공개된 뒤
update public.app_config
set android_latest_version = '1.2'
where id = 1;
```

두 스토어의 공개 시점이 다르면 값을 함께 올리지 않는다. 심사 중에 값을 먼저 올리면 사용자가 업데이트 버튼을 눌러도 이전 버전만 보게 된다.

## 필수 업데이트

서버 변경 등으로 구버전을 더는 지원할 수 없을 때만 최소 버전을 지정한다. 해당 버전보다 낮은 앱은 업데이트 창을 닫을 수 없다.

```sql
update public.app_config
set ios_minimum_version = '1.1',
    android_minimum_version = '1.1'
where id = 1;
```

필수 업데이트를 해제할 때는 최소 버전을 비운다.

```sql
update public.app_config
set ios_minimum_version = null,
    android_minimum_version = null
where id = 1;
```

안내 문구는 40자 제목과 160자 본문 범위에서 바꿀 수 있다.

```sql
update public.app_config
set update_title = '새로운 하비데이가 준비됐어요',
    update_message = '더 안정적인 이용과 새로운 기능을 위해 최신 버전으로 업데이트해주세요.'
where id = 1;
```
