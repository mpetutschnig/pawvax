/plan
sind local token auch im web und umgekehrt gültig?
---
zuletzt gescannte tiere unter der auflistung der eigenen tiere

-------
contrast bei den recently scanned pets passt im darkmode nicht
---------------
geh sicher, dass neue user nur user sind und keine vet oder behöreden

-----------------
geh sicher das jeder user nur eine rolle hat, user oder vet oder behörde
-------------------
vet kann zu jedem tier das er gescannt, per sharinglink, barcode oder sonstig gescannt geöffnet hat, dokumente hinzufügen. diese dokumente darf nur dieser vet wieder löschen und bearbiten, auch die impfungen, behandlungen die einzelnen extrahierten rows darf nur der vet löschen, der user kann aber die sichtbarkeit festlegen für die rollen.
solche einträge, dokumente bekommen einen verfikations marker und den namen des tierarztes auf einem badge.
--------------------
vet dokumente müssen auch tabellarisch dargestellt werden, jeder bekannte dokumententyp sollte so darstellbar sein, mit dem marker und verfied. und der user darf die sichtbarkeit managen.
--------------------
beim loginscreen hätte ich noch gerne eine tenant auswahl, besser gesagt ein textfeld in dem der user seine dmain eintragen kann, wenn er dieses projekt wo anderes hostet. diese url dient dann für sämtliche kpmmunikation wie api und so weiter. das ist extrem wichtig, wenn die url sich unterscheidet, ist das ein anderer tenant also ein anderer userkreis andere datenbank wahrscheinlich, aber ich denk wenn alles über die domain referenzierbbar ist, ists kein problem
-----------------
im adminportal, teil die settings auf, ich hab lieber mehr menüpuunkte dafür kürzere sites.
und im admin dashboard sollten die badges klickbar sein wie zum beispiel der testbadge
-----------------
wie sieht es mit multisite dokumenten aus, werden diese auch analysiert und in die einzelnen bestandteile aufgeteilt, also in tabelleneinträge je erkannten einträgen der dokumenttypen
-----------------
wie sieht es mit oauth aus, können wir google, github, microsoft auch als authentifizierungsform verwenden?
----------------
wenn du fragen hast frag mich sofort damit wir den plan perfektionieren können
-------------------
Tests müssen auf jeden Fall übertragen werden, auch wenn sie fehlschlagen will ich dies in der Admin site sehen.
---------------------
können wir supabase authenfitifzierung auch einbauen, also ein handshako oder so, wir verifizieren den richtigen token, erstellen ein konte oder melden direkt an. wenn alles passt bekommt der user einen token von uns für die weitere authentifizierung
wie der supabase token zu uns kommt kann ich noch nicht sagen, ich den per querystring parameter von einem url aufruf
-----------------------
in der adminpage sehe ich noch keine tests, diese müssen zwingend angezeigt werden.
auflistung der letzten 50 testruns, und wenn ich auf einen testrun klick liste aller tests und bei klick auf einen test details zum test