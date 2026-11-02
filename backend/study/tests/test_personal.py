from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from study.models import PersonalCover


class PersonalCoverTests(APITestCase):
    url = '/api/v1/profile/cover/'

    def setUp(self):
        User = get_user_model()
        self.a, self.b = (User.objects.create_user(username=n, password='a-long-test-password') for n in ('a', 'b'))
        self.client.force_login(self.a)

    def picture(self, color='blue'):
        buf = BytesIO()
        Image.new('RGB', (1850, 980), color).save(buf, 'JPEG', comment=b'private camera metadata')
        return SimpleUploadedFile('original.jpg', buf.getvalue(), 'image/jpeg')

    def test_exact_words_persist_after_new_login_and_other_profile_is_blank(self):
        words = '  For Mom.\nAnd the things we planned.  '
        self.assertEqual(self.client.patch(self.url, {'words': words, 'show_on_entry': True}, format='json').status_code, 200)
        self.client.logout()
        self.client.login(username='a', password='a-long-test-password')
        response = self.client.get('/api/v1/auth/me/')
        self.assertEqual(response.data['user']['cover']['words'], words)
        self.assertTrue(response.data['user']['cover']['show_on_entry'])
        self.assertIn('no-store', response['Cache-Control'])
        self.client.force_login(self.b)
        self.assertEqual(self.client.get('/api/v1/auth/me/').data['user']['cover']['words'], '')

    def test_private_resized_variants_reposition_replace_and_delete(self):
        result = self.client.patch(self.url, {'image': self.picture(), 'focal_y': 83}, format='multipart')
        self.assertEqual(result.status_code, 200)
        old_revision = result.data['image_revision']
        self.assertEqual(result.data['focal_y'], 83)
        path = self.url+'image/'
        for size, width in [('wide', 1600), ('small', 640)]:
            result = self.client.get(path+size+'/')
            self.assertIn('private', result['Cache-Control'])
            self.assertIn('no-store', result['Cache-Control'])
            img = Image.open(BytesIO(result.content))
            self.assertEqual((img.format, img.width), ('WEBP', width))
            self.assertNotIn(b'private camera', result.content)
        self.client.force_login(self.b)
        self.assertEqual(self.client.get(path+'wide/?user='+str(self.a.pk)).status_code, 404)
        self.client.logout()
        self.assertEqual(self.client.get(path+'wide/').status_code, 401)
        self.client.force_login(self.a)
        self.assertNotEqual(self.client.patch(self.url, {'image': self.picture('red')}, format='multipart').data['image_revision'], old_revision)
        self.assertEqual(self.client.patch(self.url, {'remove_image': True}).status_code, 200)
        self.assertEqual(self.client.get(path+'small/').status_code, 404)
        self.assertIsNone(PersonalCover.objects.get(user=self.a).wide)

    def test_invalid_payload_does_not_change_saved_cover(self):
        self.client.patch(self.url, {'words': 'Saved.'})
        for update in ({'image': SimpleUploadedFile('fake.jpg', b'<svg/>', 'image/jpeg')},
                       {'image': SimpleUploadedFile('large.png', bytes(6*1024*1024+1), 'image/png')},
                       {'words': 'x'*241}, {'focal_x': 101}):
            self.assertEqual(self.client.patch(self.url, update, format='multipart').status_code, 400)
        self.assertEqual(PersonalCover.objects.get(user=self.a).words, 'Saved.')


    def test_rejects_animated_and_oversized_decoded_images(self):
        animated, large = BytesIO(), BytesIO()
        Image.new('RGB', (16, 16), 'red').save(animated, 'PNG', save_all=True,
            append_images=[Image.new('RGB', (16, 16), 'blue')], duration=100)
        Image.new('L', (4001, 4000)).save(large, 'PNG')
        for buf in (animated, large):
            image = SimpleUploadedFile('small-upload.png', buf.getvalue(), 'image/png')
            self.assertEqual(self.client.patch(self.url, {'image': image}, format='multipart').status_code, 400)
        self.assertFalse(PersonalCover.objects.filter(user=self.a).exists())
