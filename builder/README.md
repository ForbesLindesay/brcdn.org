# builder

To build run:

```
docker build -t browserifyer .
```

To run use

```
echo '{"module": "throat", "version": "2.0.2", "options": {"entries": ["./"],"standalone": "throat"}}' | docker run -i browserifyer > throat.js
```
