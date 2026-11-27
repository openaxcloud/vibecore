#!/bin/sh
case " $* " in
*" get pod "*) echo '{"kind":"Pod","metadata":{"name":"local"},"status":{"phase":"Running","podIP":"127.0.0.1","conditions":[{"type":"Ready","status":"True"}]}}';;
*" get nodes "*|*" get pods "*) echo '{"items":[]}';;
*" apply "*) echo '{}';;
*) exit 0;;
esac
