#!/usr/bin/env python3
"""Exercise the real frontend proxy and API using a disposable local account."""
import json
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
import http.cookiejar
from datetime import datetime, timedelta, timezone

origin = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')
if urllib.parse.urlparse(origin).hostname not in {'localhost', '127.0.0.1', '::1'}:
    raise SystemExit('This disposable-data smoke test is restricted to localhost.')
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
csrf = ''
checks = 0
password = f'local-QA-{uuid.uuid4()}-only'
created = False

def request(path, method='GET', payload=None, status=200):
    global csrf, checks
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(origin+'/api/v1/'+path, data=body, method=method,
            headers={'Content-Type':'application/json','X-CSRFToken':csrf,'Origin':origin})
    try:
        response = client.open(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    data = json.loads(raw) if raw else None
    assert response.status == status, (path,response.status,status,data)
    checks += 1
    if isinstance(data,dict) and 'csrfToken' in data:
        csrf=data['csrfToken']
    return data

try:
    request('auth/me/',status=401)
    request('auth/csrf/')
    account=request('auth/register/','POST',{'email':f'qa-{uuid.uuid4().hex}@sesh.invalid',
        'first_name':'Disposable QA','password':password,'timezone':'Asia/Kathmandu'},201)
    created=True
    assert account['preferences']['timezone']=='Asia/Kathmandu'
    request('preferences/','PATCH',{'daily_goal_minutes':30,'weekly_goal_minutes':120,'rest_days':[6]})
    subject=request('subjects/','POST',{'name':'QA subject','color':'#748367','weekly_goal_minutes':60},201)
    topic=request('topics/','POST',{'subject':subject['id'],'name':'QA topic'},201)
    active=request('sessions/start/','POST',{'subject':subject['id'],'topic':topic['id'],'mode':'stopwatch','client_event_id':'start-qa'},201)
    assert request('sessions/active/')['id']==active['id']
    request('sessions/start/','POST',{'subject':subject['id'],'mode':'stopwatch'},409)
    time.sleep(1.1)
    paused=request(f"sessions/{active['id']}/pause/",'POST',{'revision':active['revision'],'client_event_id':'pause-qa'})
    assert paused['elapsed_seconds']>=1
    assert request('sessions/active/')['status']=='paused'
    request(f"sessions/{active['id']}/resume/",'POST',{'revision':active['revision']},409)
    resumed=request(f"sessions/{active['id']}/resume/",'POST',{'revision':paused['revision']})
    completed=request(f"sessions/{active['id']}/finish/",'POST',{'revision':resumed['revision'],'client_event_id':'finish-qa','note':'QA timer'})
    assert request('sessions/active/') is None
    assert request(f"sessions/{active['id']}/finish/",'POST',{'revision':resumed['revision'],'client_event_id':'finish-qa'})['revision']==completed['revision']
    start=datetime.now(timezone.utc)-timedelta(days=8,hours=2)
    manual=request('sessions/','POST',{'subject':subject['id'],'topic':topic['id'],'started_at':start.isoformat(),'duration_seconds':1800,'note':'QA manual'},201)
    before=request('analytics/')
    assert before['all_time_seconds']==completed['elapsed_seconds']+1800
    edited=request(f"sessions/{manual['id']}/",'PATCH',{'duration_seconds':2400,'note':'QA edited'})
    after=request('analytics/')
    assert after['all_time_seconds']-before['all_time_seconds']==600
    date=start.astimezone(timezone(timedelta(hours=5,minutes=45))).date()
    calendar=request(f'calendar/?from={date}&to={date}')
    assert calendar['days'][0]['seconds']==2400
    week=date-timedelta(days=date.weekday())
    review=request(f'reviews/?week={week}')
    assert review['total_seconds']==2400
    assert isinstance(review['insights'],list)
    request(f"subjects/{subject['id']}/",'PATCH',{'archived':True})
    assert request('analytics/')['all_time_seconds']==after['all_time_seconds']
    request(f"subjects/{subject['id']}/",'DELETE',{'confirm':True},409)
    request(f"subjects/{subject['id']}/",'PATCH',{'archived':False})
    export=request('export/')
    assert export['schema_version']==1 and len(export['sessions'])==2
    request(f"sessions/{manual['id']}/",'DELETE',status=204)
    assert request('analytics/')['all_time_seconds']==completed['elapsed_seconds']
    request('auth/logout/','POST')
    request('auth/me/',status=401)
    request('auth/csrf/')
    request('auth/login/','POST',{'email':account['user']['email'],'password':password})
    print(f'PASS: {checks} real HTTP checks through {origin}; auth, CSRF, timer, history, analytics, calendar, reviews, archive, export and logout/login.')
finally:
    if created:
        request('auth/account/','DELETE',{'password':password},204)
        request('auth/me/',status=401)
        print('Disposable QA account and all its records removed.')
