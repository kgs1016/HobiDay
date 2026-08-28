-- gym-photos: 암장 대표사진 버킷 (public read; 쓰기는 service role 전용)
insert into storage.buckets (id, name, public)
values ('gym-photos', 'gym-photos', true)
on conflict (id) do nothing;
