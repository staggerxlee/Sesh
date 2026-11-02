from io import BytesIO
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpResponse
from django.views.decorators.cache import never_cache
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from .models import PersonalCover


def cover_payload(cover):
    if cover is None:
        return {'words': '', 'show_on_entry': False, 'focal_x': 50, 'focal_y': 50, 'image_revision': None}
    return {k: getattr(cover, k) for k in ('words', 'show_on_entry', 'focal_x', 'focal_y', 'image_revision')}


def user_cover(user):
    return cover_payload(PersonalCover.objects.defer('wide', 'small').filter(user=user).first())


class CoverUpdate(serializers.Serializer):
    words = serializers.CharField(max_length=240, allow_blank=True, trim_whitespace=False, required=False)
    show_on_entry = serializers.BooleanField(required=False)
    focal_x = serializers.IntegerField(min_value=0, max_value=100, required=False)
    focal_y = serializers.IntegerField(min_value=0, max_value=100, required=False)
    image = serializers.FileField(required=False)
    remove_image = serializers.BooleanField(required=False)


def variants(upload):
    if upload.size > 6 * 1024 * 1024:
        raise serializers.ValidationError({'image': 'Choose an image under 6 MB.'})
    try:
        with Image.open(upload, formats=('JPEG', 'PNG', 'WEBP')) as source:
            if source.width * source.height > 16_000_000 or getattr(source, 'n_frames', 1) != 1:
                raise ValueError()
            source.load()
            upright = ImageOps.exif_transpose(source).convert('RGBA')
            base = Image.new('RGB', upright.size, '#24252a')
            base.paste(upright, mask=upright.getchannel('A'))
            results = []
            for bound in (1600, 640):
                base.thumbnail((bound, bound), Image.Resampling.LANCZOS)
                out = BytesIO()
                base.save(out, 'WEBP', quality=82, method=4)
                results.append(out.getvalue())
            return results
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise serializers.ValidationError({'image': 'Choose a still JPEG, PNG or WebP up to 16 megapixels.'})


@never_cache
@api_view(['PATCH'])
def edit_cover(request):
    serializer = CoverUpdate(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    upload, remove = data.pop('image', None), data.pop('remove_image', False)
    if upload and remove:
        raise serializers.ValidationError({'image': 'Choose either replace or remove.'})
    images = variants(upload) if upload else None
    with transaction.atomic():
        # Serialize first-time creations and edits from two devices for this user.
        get_user_model().objects.select_for_update().only('pk').get(pk=request.user.pk)
        cover, _ = PersonalCover.objects.defer('wide', 'small').get_or_create(user=request.user)
        for field, value in data.items():
            setattr(cover, field, value)
        if images or remove:
            cover.wide, cover.small = images or (None, None)
            cover.image_revision = uuid4() if images else None
        cover.save()
    return Response(cover_payload(cover))


@never_cache
@api_view(['GET'])
def cover_image(request, size):
    if size not in ('wide', 'small'):
        raise NotFound()
    image = PersonalCover.objects.filter(user=request.user).values_list(size, flat=True).first()
    if not image:
        raise NotFound()
    response = HttpResponse(bytes(image), content_type='image/webp')
    response['Cross-Origin-Resource-Policy'] = 'same-origin'
    return response
