# builder

To build run:

```
docker build -t browserifyer .
```

To run use

```
echo '{"module": "throat", "version": "2.0.2", "bundles": [{"entries": ["./"],"standalone": "throat"}]}' | docker run -i browserifyer
```
echo '{"module": "request", "version": "2.53.0", "bundles": [{"entries": ["./"]}]}' | docker run -i browserifyer
