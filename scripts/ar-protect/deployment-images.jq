# Slurped input distinguishes an empty response from a complete empty app list.
def nonempty: type == "string" and test("^\\S+$");
if length != 1 then error("expected one deployment inventory") else .[0] end
| if (.items | type) != "array" or (.metadata.continue // "") != ""
  then error("incomplete deployment inventory") else .items end
| if $platform and length == 0 then error("no platform deployments") else .[] end
| .metadata.name as $name | .spec.template.spec as $spec
| if ($name | nonempty) and ($spec.containers | type == "array" and length > 0)
  then . else error("invalid deployment") end
| (if $platform then ($spec.containers[], $spec.initContainers[]?) else $spec.containers[0] end)
| if (.image | nonempty) then .image else error("missing container image") end
| if $platform then
    if startswith($repo + "/") then . else error("desired image outside managed repository: " + .) end
  else [$name, .] | @tsv end
